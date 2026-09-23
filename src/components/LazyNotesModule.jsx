import { Component, Suspense, lazy, useMemo, useState } from 'react'
import ModuleLoader, { ModuleLoadError } from './ModuleLoader'
import { readWithTimeout } from '../lib/readWithTimeout'

const loadNotes = () => import('./NotesModule')
export const preloadNotes = () => {
  void loadNotes().catch(() => {})
}

class NotesBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <ModuleLoadError
        title="No se pudo abrir Notas"
        onRetry={this.props.onRetry}
      />
    ) : (
      this.props.children
    )
  }
}

export default function LazyNotesModule(props) {
  const [attempt, setAttempt] = useState(0)
  const Notes = useMemo(() => lazy(() => readWithTimeout(loadNotes)), [attempt])
  return (
    <NotesBoundary
      key={attempt}
      onRetry={() => setAttempt((current) => current + 1)}
    >
      <Suspense fallback={<ModuleLoader label="Abriendo notas..." />}>
        <Notes {...props} />
      </Suspense>
    </NotesBoundary>
  )
}
