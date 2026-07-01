import { useMemo } from "react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { parseJsonInput } from "@/lib/tool-starter-json"

type ToolJsonEditorProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function ToolJsonEditor({
  value,
  onChange,
  disabled = false,
}: ToolJsonEditorProps) {
  const parseResult = useMemo(() => parseJsonInput(value), [value])

  return (
    <div className="space-y-2" data-testid="tool-json-editor">
      <Label htmlFor="tool-input-json">Input JSON</Label>
      <Textarea
        id="tool-input-json"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={12}
        spellCheck={false}
        className="font-mono text-xs leading-relaxed"
        data-testid="tool-input-textarea"
      />
      {!parseResult.valid && value.trim().length > 0 ? (
        <p
          className="text-sm text-destructive"
          data-testid="json-syntax-error"
        >
          {parseResult.error}
        </p>
      ) : null}
      {parseResult.valid ? (
        <p className="text-xs text-muted-foreground">Valid JSON syntax.</p>
      ) : null}
    </div>
  )
}
