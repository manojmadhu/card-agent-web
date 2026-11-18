import * as React from "react"
import CodeMirror from "@uiw/react-codemirror"
import { yaml } from "@codemirror/lang-yaml"
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint"
import { EditorView } from "@codemirror/view"
import { parseFamilyYaml } from "@/engine/schema"
import { useTheme } from "@/components/theme-provider"

const yamlLinter = linter((view) => {
  const { issues } = parseFamilyYaml(view.state.doc.toString())
  return issues.map<Diagnostic>((i) => {
    const line = view.state.doc.line(Math.min(Math.max(1, i.line), view.state.doc.lines))
    return { from: line.from, to: line.to, severity: "error", message: (i.path ? `${i.path}: ` : "") + i.message }
  })
}, { delay: 250 })

export function YamlEditor({ value, onChange, height = "560px" }: { value: string; onChange: (v: string) => void; height?: string }) {
  const { theme } = useTheme()
  const ext = React.useMemo(() => [yaml(), yamlLinter, lintGutter(), EditorView.lineWrapping], [])
  return (
    <div className="overflow-hidden rounded-lg border">
      <CodeMirror value={value} onChange={onChange} height={height} theme={theme === "dark" ? "dark" : "light"} extensions={ext} basicSetup={{ foldGutter: true, highlightActiveLine: true }} />
    </div>
  )
}
