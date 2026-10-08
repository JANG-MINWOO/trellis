import { useEffect } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { FileTree } from '../features/files'
import { Inspector } from '../features/inspector'
import { ProjectList } from '../features/projects'
import { TerminalArea } from '../features/terminal'
import { useStore } from '../state/store'
import { StatusBar } from './StatusBar'
import { TitleBar } from './TitleBar'

export function AppShell() {
  const leftRef = usePanelRef()
  const rightRef = usePanelRef()
  const panelToggle = useStore((s) => s.panelToggle)
  const main = useDefaultLayout({ id: 'trellis-main', storage: localStorage })
  const side = useDefaultLayout({ id: 'trellis-left', storage: localStorage })

  useEffect(() => {
    if (!panelToggle) return
    const ref = panelToggle.side === 'left' ? leftRef : rightRef
    const panel = ref.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }, [panelToggle, leftRef, rightRef])

  return (
    <>
      <TitleBar />
      <div className="min-h-0 flex-1">
        <Group
          orientation="horizontal"
          defaultLayout={main.defaultLayout}
          onLayoutChanged={main.onLayoutChanged}
          className="h-full"
        >
          <Panel
            id="left"
            panelRef={leftRef}
            defaultSize={250}
            minSize={190}
            maxSize="40%"
            collapsible
            collapsedSize={0}
            className="bg-surface"
          >
            <Group
              orientation="vertical"
              defaultLayout={side.defaultLayout}
              onLayoutChanged={side.onLayoutChanged}
              className="h-full"
            >
              <Panel id="projects" defaultSize="38%" minSize={90}>
                <ProjectList />
              </Panel>
              <Separator className="h-px" />
              <Panel id="files" minSize={120}>
                <FileTree />
              </Panel>
            </Group>
          </Panel>
          <Separator className="w-px" />
          <Panel id="center" minSize={420}>
            <TerminalArea />
          </Panel>
          <Separator className="w-px" />
          <Panel
            id="right"
            panelRef={rightRef}
            defaultSize={400}
            minSize={300}
            maxSize="50%"
            collapsible
            collapsedSize={0}
          >
            <Inspector />
          </Panel>
        </Group>
      </div>
      <StatusBar />
    </>
  )
}
