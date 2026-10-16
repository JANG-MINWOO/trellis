import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, File, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import type { ChangeStatus, FileNode } from '@shared/types'
import { IconButton, SectionLabel, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { STATUS_TEXT } from '../../lib/change-status'
import { cn } from '../../lib/cn'
import { useActiveProject, useStore } from '../../state/store'

/** Remounts per project so expanded folders and cached listings never leak across projects. */
export function FileTree() {
  const projectId = useStore((s) => s.activeProjectId)
  return <ProjectFileTree key={projectId ?? 'none'} />
}

function ProjectFileTree() {
  const { t } = useTranslation()
  const project = useActiveProject()
  const projectId = project?.id ?? null
  const report = useStore((s) => (projectId ? s.changes[projectId] : undefined))
  const openFile = useStore((s) => s.openFile)
  const [children, setChildren] = useState<Record<string, FileNode[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(projectId !== null)
  const expandedRef = useRef(expanded)
  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])

  const load = useCallback(
    (dir: string): Promise<void> =>
      projectId
        ? api.files
            .list(projectId, dir)
            .then((nodes) => setChildren((c) => ({ ...c, [dir]: nodes })))
        : Promise.resolve(),
    [projectId],
  )

  useEffect(() => {
    if (!projectId) return
    void api.files
      .list(projectId, '')
      .then((nodes) => setChildren({ '': nodes }))
      .finally(() => setLoading(false))
    // Refresh what is visible when files change on disk.
    return api.projects.onFsChanged((changed) => {
      if (changed !== projectId) return
      void load('')
      expandedRef.current.forEach((dir) => void load(dir))
    })
  }, [projectId, load])

  const changed = useMemo(() => {
    const files = new Map<string, ChangeStatus>()
    const dirs = new Set<string>()
    if (report?.kind === 'ok') {
      for (const group of report.groups)
        for (const f of group.files) {
          files.set(f.path, f.status)
          const parts = f.path.split('/')
          for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
        }
    }
    return { files, dirs }
  }, [report])

  const toggle = (dir: string): void => {
    // Updaters may run twice (StrictMode), so the fetch stays outside.
    const opening = !expanded.has(dir)
    setExpanded((prev) => {
      const next = new Set(prev)
      if (opening) next.add(dir)
      else next.delete(dir)
      return next
    })
    if (opening && !children[dir]) void load(dir)
  }

  const open = async (path: string): Promise<void> => {
    if (!projectId) return
    await openFile(projectId, path)
  }

  const renderLevel = (dir: string, depth: number): React.ReactNode =>
    (children[dir] ?? []).map((node) => {
      const isOpen = expanded.has(node.path)
      const status = changed.files.get(node.path)
      return (
        <div key={node.path}>
          <div
            role="treeitem"
            aria-expanded={node.isDir ? isOpen : undefined}
            onClick={() => (node.isDir ? toggle(node.path) : void open(node.path))}
            className={cn(
              'group flex h-6.5 items-center gap-1.5 rounded-md pr-2 text-row hover:bg-surface-2',
              node.ignored && 'opacity-45',
            )}
            style={{ paddingLeft: depth * 12 + 6 }}
            title={node.path}
          >
            {node.isDir ? (
              <ChevronRight
                size={13}
                className={cn('shrink-0 text-fg-faint transition-transform', isOpen && 'rotate-90')}
              />
            ) : (
              <span className="w-3.25 shrink-0" />
            )}
            {node.isDir ? (
              isOpen ? (
                <FolderOpen size={14} className="shrink-0 text-fg-muted" />
              ) : (
                <Folder size={14} className="shrink-0 text-fg-muted" />
              )
            ) : (
              <File size={14} className="shrink-0 text-fg-faint" />
            )}
            <span
              className={cn('min-w-0 flex-1 truncate', status ? STATUS_TEXT[status] : 'text-fg')}
            >
              {node.name}
            </span>
            {status && (
              <span className={cn('text-2xs font-semibold', STATUS_TEXT[status])}>{status}</span>
            )}
            {!status && node.isDir && changed.dirs.has(node.path) && (
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            )}
          </div>
          {node.isDir && isOpen && renderLevel(node.path, depth + 1)}
        </div>
      )
    })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionLabel
        actions={
          project && (
            <IconButton
              label={t('common.refresh')}
              onClick={() => void load('').then(() => expanded.forEach((d) => void load(d)))}
            >
              <RefreshCw size={13} />
            </IconButton>
          )
        }
      >
        {t('files.title')}
      </SectionLabel>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-2" role="tree">
        {!project ? null : loading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (children[''] ?? []).length === 0 ? (
          <div className="px-3 py-4 text-xs text-fg-faint">{t('files.empty')}</div>
        ) : (
          renderLevel('', 0)
        )}
      </div>
    </div>
  )
}
