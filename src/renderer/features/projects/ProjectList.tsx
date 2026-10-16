import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DropdownMenu } from 'radix-ui'
import { Ellipsis, FolderOpen, Plus, Trash, TriangleAlert } from 'lucide-react'
import type { ProjectView } from '@shared/types'
import { EmptyState, IconButton, SectionLabel } from '../../components/ui'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { shortenHome } from '../../lib/format'
import { revealKey, useIsMac } from '../../state/derived'
import { useStore } from '../../state/store'

export function ProjectList() {
  const { t } = useTranslation()
  const projects = useStore((s) => s.projects)
  const activeId = useStore((s) => s.activeProjectId)
  const terminals = useStore((s) => s.terminals)
  const selectProject = useStore((s) => s.selectProject)
  const addProject = useStore((s) => s.addProject)
  const removeProject = useStore((s) => s.removeProject)
  const isMac = useIsMac()

  const running = useMemo(() => {
    const set = new Set<string>()
    for (const term of Object.values(terminals))
      if (term.kind === 'claude' && term.running) set.add(term.projectId)
    return set
  }, [terminals])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionLabel
        actions={
          <IconButton
            label={t('projects.add')}
            shortcut={isMac ? '⌘O' : 'Ctrl+O'}
            onClick={() => void addProject()}
          >
            <Plus size={15} />
          </IconButton>
        }
      >
        {t('projects.title')}
      </SectionLabel>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {projects.length === 0 ? (
          <EmptyState title={t('projects.empty')} body={t('projects.emptyHint')} className="py-6" />
        ) : (
          projects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              active={p.id === activeId}
              running={running.has(p.id)}
              onSelect={() => void selectProject(p.id)}
              onRemove={() => {
                if (window.confirm(t('projects.confirmRemove', { name: p.name })))
                  void removeProject(p.id)
              }}
              revealLabel={t(revealKey('projects', isMac))}
              removeLabel={t('projects.remove')}
              moreLabel={t('common.more')}
              runningLabel={t('projects.running')}
              missingLabel={t('projects.missing')}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ProjectRow(props: {
  project: ProjectView
  active: boolean
  running: boolean
  onSelect: () => void
  onRemove: () => void
  revealLabel: string
  removeLabel: string
  moreLabel: string
  runningLabel: string
  missingLabel: string
}) {
  const { project, active, running } = props
  return (
    <div
      className={cn(
        'group relative flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors',
        active ? 'bg-surface-3' : 'hover:bg-surface-2',
      )}
      onClick={props.onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && props.onSelect()}
      data-testid={`project-${project.name}`}
    >
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold uppercase',
          active ? 'bg-accent-soft text-accent' : 'bg-surface-3 text-fg-muted',
        )}
      >
        {project.name.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'truncate text-sm',
              active ? 'font-semibold text-fg' : 'font-medium text-fg',
            )}
          >
            {project.name}
          </span>
          {running && (
            <span
              title={props.runningLabel}
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            />
          )}
          {project.missing && (
            <TriangleAlert
              size={12}
              className="shrink-0 text-warning"
              aria-label={props.missingLabel}
            />
          )}
        </div>
        <div className="truncate text-2xs text-fg-faint" title={project.path}>
          {shortenHome(project.path)}
        </div>
      </div>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={props.moreLabel}
            onClick={(e) => e.stopPropagation()}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-faint opacity-0 group-hover:opacity-100 hover:bg-surface-3 hover:text-fg data-[state=open]:opacity-100"
          >
            <Ellipsis size={14} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-[180px] rounded-lg border border-border bg-surface p-1 text-sm shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem
              onSelect={() => void api.projects.reveal(project.id)}
              icon={<FolderOpen size={14} />}
            >
              {props.revealLabel}
            </MenuItem>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <MenuItem onSelect={props.onRemove} icon={<Trash size={14} />} danger>
              {props.removeLabel}
            </MenuItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}

function MenuItem({
  children,
  icon,
  onSelect,
  danger,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  onSelect: () => void
  danger?: boolean
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex h-8 items-center gap-2 rounded-md px-2 outline-none data-[highlighted]:bg-surface-2',
        danger ? 'text-danger' : 'text-fg',
      )}
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  )
}
