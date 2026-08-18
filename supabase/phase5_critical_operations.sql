-- FASE 5 - Operaciones criticas atomicas para Supabase/PostgreSQL.
-- Ejecutar en Supabase SQL Editor despues de tener creadas las tablas existentes.
-- No recrea tablas ni migra historicos.

create or replace function public.kr_make_bigint_id()
returns bigint
language sql
volatile
security definer
set search_path = public
as $$
  select (floor(extract(epoch from clock_timestamp()) * 1000)::bigint * 1000)
    + floor(random() * 1000)::bigint;
$$;

create or replace function public.kr_insert_log(
  p_type text,
  p_entity text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id bigint := public.kr_make_bigint_id();
begin
  insert into public.logs (id, type, entity, message, metadata, created_at)
  values (
    v_log_id,
    coalesce(nullif(p_type, ''), 'success'),
    p_entity,
    p_message,
    coalesce(p_metadata, '{}'::jsonb),
    now()
  );

  return v_log_id;
end;
$$;

create or replace function public.kr_transaction_json(p_transaction_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select to_jsonb(t) || jsonb_build_object(
    'transaction_items',
    coalesce(
      (
        select jsonb_agg(to_jsonb(ti) order by ti.id)
        from public.transaction_items ti
        where ti.transaction_id = t.id
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.transactions t
  where t.id = p_transaction_id;

  return v_result;
end;
$$;

create or replace function public.kr_debt_json(p_debt_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select to_jsonb(d) || jsonb_build_object(
    'debt_items',
    coalesce(
      (
        select jsonb_agg(to_jsonb(di) order by di.id)
        from public.debt_items di
        where di.debt_id = d.id
      ),
      '[]'::jsonb
    ),
    'debt_payments',
    coalesce(
      (
        select jsonb_agg(to_jsonb(dp) order by dp.created_at, dp.id)
        from public.debt_payments dp
        where dp.debt_id = d.id
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.debts d
  where d.id = p_debt_id;

  return v_result;
end;
$$;

create or replace function public.kr_recalculate_debt(p_debt_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric := 0;
  v_paid numeric := 0;
  v_remaining numeric := 0;
begin
  select total_amount
  into v_total
  from public.debts
  where id = p_debt_id
  for update;

  if not found then
    raise exception 'Deuda inexistente';
  end if;

  select coalesce(sum(amount), 0)
  into v_paid
  from public.debt_payments
  where debt_id = p_debt_id;

  v_remaining := greatest(v_total - v_paid, 0);

  update public.debts
  set
    paid_amount = v_paid,
    remaining_amount = v_remaining,
    status = case when v_remaining <= 0 then 'paid' else 'pending' end,
    updated_at = now()
  where id = p_debt_id;
end;
$$;

create or replace function public.kr_read_item_number(p_item jsonb, p_snake text, p_camel text)
returns numeric
language plpgsql
immutable
security definer
set search_path = public
as $$
begin
  return nullif(coalesce(p_item ->> p_snake, p_item ->> p_camel), '')::numeric;
end;
$$;

create or replace function public.create_sale(
  p_transaction_id bigint,
  p_amount numeric,
  p_payment_method text,
  p_note text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product record;
  v_product_id bigint;
  v_quantity integer;
  v_sale_price numeric;
  v_expected_total numeric := 0;
  v_item_count integer := 0;
begin
  if p_transaction_id is null then
    raise exception 'Falta el ID de la venta';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Monto inválido';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  if exists (select 1 from public.transactions where id = p_transaction_id) then
    raise exception 'Venta ya existe o ya fue procesada';
  end if;

  insert into public.transactions (
    id, type, amount, payment_method, note, created_at, updated_at
  )
  values (
    p_transaction_id,
    'sale',
    p_amount,
    coalesce(nullif(p_payment_method, ''), 'cash'),
    p_note,
    now(),
    now()
  );

  for v_item in select value from jsonb_array_elements(p_items) as item(value)
  loop
    v_product_id := public.kr_read_item_number(v_item, 'product_id', 'id')::bigint;
    v_quantity := public.kr_read_item_number(v_item, 'quantity', 'quantity')::integer;
    v_sale_price := public.kr_read_item_number(v_item, 'sale_price', 'salePrice');

    if v_product_id is null then
      raise exception 'Producto inválido en la venta';
    end if;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Cantidad inválida en la venta';
    end if;

    if v_sale_price is null or v_sale_price < 0 then
      raise exception 'Precio inválido en la venta';
    end if;

    select *
    into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception 'Producto inexistente: %', v_product_id;
    end if;

    if coalesce(v_product.stock, 0) < v_quantity then
      raise exception 'Stock insuficiente para %', v_product.name;
    end if;

    insert into public.transaction_items (
      transaction_id,
      product_id,
      product_name,
      product_type,
      product_size,
      quantity,
      sale_price
    )
    values (
      p_transaction_id,
      v_product_id,
      coalesce(nullif(v_item ->> 'product_name', ''), nullif(v_item ->> 'name', ''), v_product.name),
      coalesce(nullif(v_item ->> 'product_type', ''), nullif(v_item ->> 'type', ''), v_product.type),
      coalesce(nullif(v_item ->> 'product_size', ''), nullif(v_item ->> 'size', ''), v_product.size),
      v_quantity,
      v_sale_price
    );

    update public.products
    set stock = stock - v_quantity, updated_at = now()
    where id = v_product_id;

    v_expected_total := v_expected_total + (v_quantity * v_sale_price);
    v_item_count := v_item_count + 1;
  end loop;

  if abs(v_expected_total - p_amount) > 0.01 then
    raise exception 'El total de la venta no coincide';
  end if;

  perform public.kr_insert_log(
    'success',
    'sale',
    'Venta registrada por RD$' || to_char(p_amount, 'FM999999999990.00'),
    jsonb_build_object(
      'transactionId', p_transaction_id,
      'amount', p_amount,
      'items', v_item_count
    )
  );

  return public.kr_transaction_json(p_transaction_id);
end;
$$;

create or replace function public.create_debt_sale(
  p_debt_id bigint,
  p_transaction_id bigint,
  p_payment_id bigint,
  p_customer_name text,
  p_total_amount numeric,
  p_paid_amount numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product record;
  v_product_id bigint;
  v_quantity integer;
  v_sale_price numeric;
  v_expected_total numeric := 0;
  v_remaining numeric := 0;
  v_status text := 'pending';
  v_item_count integer := 0;
begin
  p_paid_amount := coalesce(p_paid_amount, 0);

  if p_debt_id is null or p_transaction_id is null then
    raise exception 'Faltan IDs para la venta fiada';
  end if;

  if nullif(trim(coalesce(p_customer_name, '')), '') is null then
    raise exception 'Nombre del cliente requerido';
  end if;

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Monto total inválido';
  end if;

  if p_paid_amount < 0 then
    raise exception 'Abono inicial inválido';
  end if;

  if p_paid_amount >= p_total_amount then
    raise exception 'Para fiar, el abono debe ser menor que el total';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La deuda no tiene productos';
  end if;

  if exists (select 1 from public.debts where id = p_debt_id) then
    raise exception 'Deuda ya existe o ya fue procesada';
  end if;

  if exists (select 1 from public.transactions where id = p_transaction_id) then
    raise exception 'Movimiento ya existe o ya fue procesado';
  end if;

  if p_paid_amount > 0 and p_payment_id is null then
    p_payment_id := public.kr_make_bigint_id();
  end if;

  v_remaining := p_total_amount - p_paid_amount;

  insert into public.debts (
    id,
    customer_name,
    total_amount,
    paid_amount,
    remaining_amount,
    status,
    created_at,
    updated_at
  )
  values (
    p_debt_id,
    trim(p_customer_name),
    p_total_amount,
    p_paid_amount,
    v_remaining,
    v_status,
    now(),
    now()
  );

  for v_item in select value from jsonb_array_elements(p_items) as item(value)
  loop
    v_product_id := public.kr_read_item_number(v_item, 'product_id', 'id')::bigint;
    v_quantity := public.kr_read_item_number(v_item, 'quantity', 'quantity')::integer;
    v_sale_price := public.kr_read_item_number(v_item, 'sale_price', 'salePrice');

    if v_product_id is null then
      raise exception 'Producto inválido en la deuda';
    end if;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Cantidad inválida en la deuda';
    end if;

    if v_sale_price is null or v_sale_price < 0 then
      raise exception 'Precio inválido en la deuda';
    end if;

    select *
    into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception 'Producto inexistente: %', v_product_id;
    end if;

    if coalesce(v_product.stock, 0) < v_quantity then
      raise exception 'Stock insuficiente para %', v_product.name;
    end if;

    insert into public.debt_items (
      debt_id,
      product_id,
      product_name,
      product_type,
      product_size,
      quantity,
      sale_price
    )
    values (
      p_debt_id,
      v_product_id,
      coalesce(nullif(v_item ->> 'product_name', ''), nullif(v_item ->> 'name', ''), v_product.name),
      coalesce(nullif(v_item ->> 'product_type', ''), nullif(v_item ->> 'type', ''), v_product.type),
      coalesce(nullif(v_item ->> 'product_size', ''), nullif(v_item ->> 'size', ''), v_product.size),
      v_quantity,
      v_sale_price
    );

    update public.products
    set stock = stock - v_quantity, updated_at = now()
    where id = v_product_id;

    v_expected_total := v_expected_total + (v_quantity * v_sale_price);
    v_item_count := v_item_count + 1;
  end loop;

  if abs(v_expected_total - p_total_amount) > 0.01 then
    raise exception 'El total de la deuda no coincide';
  end if;

  if p_paid_amount > 0 then
    insert into public.debt_payments (
      id,
      debt_id,
      amount,
      payment_method,
      note,
      created_at
    )
    values (
      p_payment_id,
      p_debt_id,
      p_paid_amount,
      'cash',
      'Abono inicial',
      now()
    );
  end if;

  insert into public.transactions (
    id,
    type,
    amount,
    payment_method,
    note,
    debt_id,
    payment_id,
    customer_name,
    total_amount,
    created_at,
    updated_at
  )
  values (
    p_transaction_id,
    'debt_sale',
    p_paid_amount,
    'cash',
    'Venta fiada a ' || trim(p_customer_name),
    p_debt_id,
    p_payment_id,
    trim(p_customer_name),
    p_total_amount,
    now(),
    now()
  );

  insert into public.transaction_items (
    transaction_id,
    product_id,
    product_name,
    product_type,
    product_size,
    quantity,
    sale_price
  )
  select
    p_transaction_id,
    di.product_id,
    di.product_name,
    di.product_type,
    di.product_size,
    di.quantity,
    di.sale_price
  from public.debt_items di
  where di.debt_id = p_debt_id;

  perform public.kr_recalculate_debt(p_debt_id);

  perform public.kr_insert_log(
    'success',
    'debt',
    'Venta fiada a ' || trim(p_customer_name) || ': RD$' || to_char(v_remaining, 'FM999999999990.00') || ' pendiente',
    jsonb_build_object(
      'debtId', p_debt_id,
      'transactionId', p_transaction_id,
      'customerName', trim(p_customer_name),
      'paidAmount', p_paid_amount,
      'remainingAmount', v_remaining,
      'items', v_item_count
    )
  );

  return jsonb_build_object(
    'debt', public.kr_debt_json(p_debt_id),
    'transaction', public.kr_transaction_json(p_transaction_id)
  );
end;
$$;

create or replace function public.register_debt_payment(
  p_payment_id bigint,
  p_transaction_id bigint,
  p_debt_id bigint,
  p_amount numeric,
  p_payment_method text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debt record;
  v_remaining numeric := 0;
begin
  if p_payment_id is null or p_transaction_id is null or p_debt_id is null then
    raise exception 'Faltan IDs para registrar el abono';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Monto inválido';
  end if;

  select *
  into v_debt
  from public.debts
  where id = p_debt_id
  for update;

  if not found then
    raise exception 'Deuda inexistente';
  end if;

  if coalesce(v_debt.status, 'pending') = 'paid' or coalesce(v_debt.remaining_amount, 0) <= 0 then
    raise exception 'Deuda ya pagada';
  end if;

  if p_amount > v_debt.remaining_amount then
    raise exception 'El abono supera el monto pendiente';
  end if;

  if exists (select 1 from public.debt_payments where id = p_payment_id) then
    raise exception 'Abono ya existe o ya fue procesado';
  end if;

  if exists (select 1 from public.transactions where id = p_transaction_id) then
    raise exception 'Movimiento ya existe o ya fue procesado';
  end if;

  insert into public.debt_payments (
    id, debt_id, amount, payment_method, note, created_at
  )
  values (
    p_payment_id,
    p_debt_id,
    p_amount,
    coalesce(nullif(p_payment_method, ''), 'cash'),
    p_note,
    now()
  );

  insert into public.transactions (
    id,
    type,
    amount,
    payment_method,
    note,
    debt_id,
    payment_id,
    customer_name,
    created_at,
    updated_at
  )
  values (
    p_transaction_id,
    'debt_payment',
    p_amount,
    coalesce(nullif(p_payment_method, ''), 'cash'),
    coalesce(nullif(p_note, ''), 'Abono de ' || v_debt.customer_name),
    p_debt_id,
    p_payment_id,
    v_debt.customer_name,
    now(),
    now()
  );

  insert into public.transaction_items (
    transaction_id,
    product_id,
    product_name,
    product_type,
    product_size,
    quantity,
    sale_price
  )
  select
    p_transaction_id,
    di.product_id,
    di.product_name,
    di.product_type,
    di.product_size,
    di.quantity,
    di.sale_price
  from public.debt_items di
  where di.debt_id = p_debt_id;

  perform public.kr_recalculate_debt(p_debt_id);

  select remaining_amount
  into v_remaining
  from public.debts
  where id = p_debt_id;

  perform public.kr_insert_log(
    'success',
    'debt',
    'Abono de ' || v_debt.customer_name || ': RD$' || to_char(p_amount, 'FM999999999990.00'),
    jsonb_build_object(
      'debtId', p_debt_id,
      'paymentId', p_payment_id,
      'transactionId', p_transaction_id,
      'amount', p_amount,
      'remainingAmount', v_remaining
    )
  );

  return jsonb_build_object(
    'debt', public.kr_debt_json(p_debt_id),
    'transaction', public.kr_transaction_json(p_transaction_id)
  );
end;
$$;

create or replace function public.create_cash_movement(
  p_transaction_id bigint,
  p_type text,
  p_amount numeric,
  p_payment_method text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := case when p_type = 'income' then 'income' else 'expense' end;
begin
  if p_transaction_id is null then
    raise exception 'Falta el ID del movimiento';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Monto inválido';
  end if;

  if exists (select 1 from public.transactions where id = p_transaction_id) then
    raise exception 'Movimiento ya existe o ya fue procesado';
  end if;

  insert into public.transactions (
    id, type, amount, payment_method, note, created_at, updated_at
  )
  values (
    p_transaction_id,
    v_type,
    p_amount,
    coalesce(nullif(p_payment_method, ''), 'cash'),
    coalesce(nullif(p_note, ''), case when v_type = 'income' then 'Ingreso manual' else 'Egreso de caja' end),
    now(),
    now()
  );

  perform public.kr_insert_log(
    'success',
    'cash',
    case when v_type = 'income' then 'Ingreso registrado en caja' else 'Egreso registrado en caja' end,
    jsonb_build_object(
      'transactionId', p_transaction_id,
      'amount', p_amount,
      'type', v_type
    )
  );

  return public.kr_transaction_json(p_transaction_id);
end;
$$;

create or replace function public.reverse_sale(p_transaction_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction record;
  v_item record;
  v_product record;
  v_original jsonb;
  v_missing_products jsonb := '[]'::jsonb;
begin
  select *
  into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Venta no encontrada o ya revertida';
  end if;

  if v_transaction.type <> 'sale' then
    raise exception 'Este movimiento no es una venta';
  end if;

  v_original := public.kr_transaction_json(p_transaction_id);

  for v_item in
    select *
    from public.transaction_items
    where transaction_id = p_transaction_id
    order by id
  loop
    if v_item.product_id is null then
      v_missing_products := v_missing_products || jsonb_build_array(to_jsonb(v_item));
    else
      select *
      into v_product
      from public.products
      where id = v_item.product_id
      for update;

      if found then
      update public.products
      set stock = stock + v_item.quantity, updated_at = now()
      where id = v_item.product_id;
      else
        v_missing_products := v_missing_products || jsonb_build_array(to_jsonb(v_item));
      end if;
    end if;
  end loop;

  delete from public.transaction_items
  where transaction_id = p_transaction_id;

  delete from public.transactions
  where id = p_transaction_id;

  perform public.kr_insert_log(
    'success',
    'cash',
    'Movimiento revertido: venta por RD$' || to_char(v_transaction.amount, 'FM999999999990.00'),
    jsonb_build_object(
      'transactionId', p_transaction_id,
      'revertedType', 'sale',
      'missingProducts', v_missing_products
    )
  );

  return v_original;
end;
$$;

create or replace function public.reverse_debt_sale(p_transaction_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction record;
  v_debt record;
  v_item record;
  v_product record;
  v_extra_payments integer := 0;
  v_original jsonb;
  v_missing_products jsonb := '[]'::jsonb;
begin
  select *
  into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Venta fiada no encontrada o ya revertida';
  end if;

  if v_transaction.type <> 'debt_sale' then
    raise exception 'Este movimiento no es una venta fiada';
  end if;

  select *
  into v_debt
  from public.debts
  where id = v_transaction.debt_id
  for update;

  if not found then
    raise exception 'Deuda asociada no encontrada';
  end if;

  select count(*)
  into v_extra_payments
  from public.debt_payments
  where debt_id = v_debt.id
    and (v_transaction.payment_id is null or id <> v_transaction.payment_id);

  if v_extra_payments > 0 then
    raise exception 'Primero revierte los abonos de esta deuda';
  end if;

  if coalesce(v_debt.paid_amount, 0) > coalesce(v_transaction.amount, 0) then
    raise exception 'Primero revierte los abonos de esta deuda';
  end if;

  v_original := public.kr_transaction_json(p_transaction_id);

  for v_item in
    select *
    from public.transaction_items
    where transaction_id = p_transaction_id
    order by id
  loop
    if v_item.product_id is null then
      v_missing_products := v_missing_products || jsonb_build_array(to_jsonb(v_item));
    else
      select *
      into v_product
      from public.products
      where id = v_item.product_id
      for update;

      if found then
      update public.products
      set stock = stock + v_item.quantity, updated_at = now()
      where id = v_item.product_id;
      else
        v_missing_products := v_missing_products || jsonb_build_array(to_jsonb(v_item));
      end if;
    end if;
  end loop;

  delete from public.transaction_items
  where transaction_id = p_transaction_id;

  delete from public.transactions
  where id = p_transaction_id;

  delete from public.debt_payments
  where debt_id = v_debt.id;

  delete from public.debt_items
  where debt_id = v_debt.id;

  delete from public.debts
  where id = v_debt.id;

  perform public.kr_insert_log(
    'success',
    'cash',
    'Movimiento revertido: venta fiada por RD$' || to_char(v_transaction.amount, 'FM999999999990.00'),
    jsonb_build_object(
      'transactionId', p_transaction_id,
      'debtId', v_debt.id,
      'revertedType', 'debt_sale',
      'missingProducts', v_missing_products
    )
  );

  return v_original;
end;
$$;

create or replace function public.reverse_debt_payment(p_transaction_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction record;
  v_payment record;
  v_debt record;
  v_remaining numeric := 0;
  v_original jsonb;
begin
  select *
  into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Pago no encontrado o ya revertido';
  end if;

  if v_transaction.type <> 'debt_payment' then
    raise exception 'Este movimiento no es un pago de deuda';
  end if;

  select *
  into v_payment
  from public.debt_payments
  where id = v_transaction.payment_id
  for update;

  if not found then
    raise exception 'Abono no encontrado o ya revertido';
  end if;

  select *
  into v_debt
  from public.debts
  where id = v_payment.debt_id
  for update;

  if not found then
    raise exception 'Deuda asociada no encontrada';
  end if;

  v_original := public.kr_transaction_json(p_transaction_id);

  delete from public.transaction_items
  where transaction_id = p_transaction_id;

  delete from public.transactions
  where id = p_transaction_id;

  delete from public.debt_payments
  where id = v_payment.id;

  perform public.kr_recalculate_debt(v_debt.id);

  select remaining_amount
  into v_remaining
  from public.debts
  where id = v_debt.id;

  perform public.kr_insert_log(
    'success',
    'cash',
    'Movimiento revertido: abono de deuda por RD$' || to_char(v_transaction.amount, 'FM999999999990.00'),
    jsonb_build_object(
      'transactionId', p_transaction_id,
      'debtId', v_debt.id,
      'paymentId', v_payment.id,
      'revertedType', 'debt_payment',
      'remainingAmount', v_remaining
    )
  );

  return v_original;
end;
$$;

create or replace function public.reverse_cash_movement(p_transaction_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction record;
  v_original jsonb;
begin
  select *
  into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Movimiento no encontrado o ya revertido';
  end if;

  if v_transaction.type not in ('income', 'expense') then
    raise exception 'Este movimiento no es ingreso ni egreso';
  end if;

  v_original := public.kr_transaction_json(p_transaction_id);

  delete from public.transaction_items
  where transaction_id = p_transaction_id;

  delete from public.transactions
  where id = p_transaction_id;

  perform public.kr_insert_log(
    'success',
    'cash',
    'Movimiento revertido: ' ||
      case when v_transaction.type = 'income' then 'ingreso' else 'egreso' end ||
      ' por RD$' || to_char(v_transaction.amount, 'FM999999999990.00'),
    jsonb_build_object(
      'transactionId', p_transaction_id,
      'revertedType', v_transaction.type
    )
  );

  return v_original;
end;
$$;

grant execute on function public.create_sale(bigint, numeric, text, text, jsonb) to authenticated;
grant execute on function public.create_debt_sale(bigint, bigint, bigint, text, numeric, numeric, jsonb) to authenticated;
grant execute on function public.register_debt_payment(bigint, bigint, bigint, numeric, text, text) to authenticated;
grant execute on function public.create_cash_movement(bigint, text, numeric, text, text) to authenticated;
grant execute on function public.reverse_sale(bigint) to authenticated;
grant execute on function public.reverse_debt_sale(bigint) to authenticated;
grant execute on function public.reverse_debt_payment(bigint) to authenticated;
grant execute on function public.reverse_cash_movement(bigint) to authenticated;
