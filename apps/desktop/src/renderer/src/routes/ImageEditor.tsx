import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ClipboardPaste,
  Copy,
  Crop,
  Download,
  Droplets,
  FolderOpen,
  ImagePlus,
  MousePointer2,
  Redo2,
  Undo2,
} from 'lucide-react'
import { DropOverlay, EmptyState, useFileDrop } from '../components/EmptyState'
import { RedactionSection, StyleSections, type RedactionDefaults } from '../components/Inspector'
import { Stage, type StageMode } from '../components/Stage'
import { Button, IconButton, Section, Segmented, TitleBar, ToolbarDivider } from '../components/ui'
import { computeLayout, renderToBlob, type Composition } from '../lib/composition'
import { handleEditorKey, loadStyle, saveStyle } from '../lib/editor'
import { useBitmap, useHistory, useKeydown, useWindowEvent } from '../lib/hooks'
import { IMAGE_FRAMES, X_IMAGE_LIMIT } from '../lib/presets'
import { savedToast, toast } from '../lib/toast'
import {
  blobToBytes,
  errorMessage,
  formatBytes,
  isTextInput,
  modKey,
  timestampName,
} from '../lib/utils'

const STYLE_KEY = 'xssential.image-style.v2'

type Format = 'png' | 'jpeg'

export default function ImageEditor() {
  const [image, setImage] = useState<ImageBitmap | null>(null)
  const history = useHistory<Composition>(() => loadStyle(STYLE_KEY))
  const { reset } = history
  const comp = history.value
  const [mode, setMode] = useState<StageMode>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [defaults, setDefaults] = useState<RedactionDefaults>({ style: 'pixelate', strength: 60 })
  const [format, setFormat] = useState<Format>('png')
  const [busy, setBusy] = useState<'copy' | 'save' | null>(null)
  const busyRef = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const backgroundImage = useBitmap(comp.background.kind === 'image' ? comp.background.url : null)

  const load = useCallback(
    async (blob: Blob) => {
      try {
        const bitmap = await createImageBitmap(blob)
        setImage(bitmap)
        // Keep the style, start fresh on crop and redactions
        reset((c) => ({ ...c, crop: null, redactions: [] }))
        setSelectedId(null)
        setMode('select')
      } catch {
        toast('That file is not an image Xssential can open.', { tone: 'error' })
      }
    },
    [reset],
  )

  // A screenshot handed over from the capture overlay
  useEffect(() => {
    window.api.image.takePending().then((png) => {
      if (png) void load(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
    })
  }, [load])

  useEffect(() => saveStyle(STYLE_KEY, comp), [comp])

  const layout = useMemo(
    () => (image ? computeLayout(comp, image.width, image.height, IMAGE_FRAMES) : null),
    [comp, image],
  )

  const pasteFromClipboard = async () => {
    const png = await window.api.clipboard.readImage()
    if (png) await load(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
    else toast('There is no image on the clipboard.', { tone: 'warning' })
  }

  const run = async (kind: 'copy' | 'save', task: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(kind)
    try {
      await task()
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' })
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  const copy = () =>
    run('copy', async () => {
      if (!image || !layout) return
      const blob = await renderToBlob(image, layout, comp, 'png', backgroundImage)
      await window.api.clipboard.writeImage(await blobToBytes(blob))
      toast(
        blob.size > X_IMAGE_LIMIT
          ? `Copied (${formatBytes(blob.size)}). X may reject images over 5 MB; save as JPEG instead.`
          : 'Copied. Paste it straight into a post.',
        { tone: blob.size > X_IMAGE_LIMIT ? 'warning' : 'success' },
      )
    })

  const save = () =>
    run('save', async () => {
      if (!image || !layout) return
      const blob = await renderToBlob(image, layout, comp, format, backgroundImage)
      const ext = format === 'png' ? 'png' : 'jpg'
      const path = await window.api.files.save({
        data: await blobToBytes(blob),
        name: timestampName('Xssential', ext),
        kind: 'image',
        filters: [{ name: format === 'png' ? 'PNG image' : 'JPEG image', extensions: [ext] }],
      })
      if (!path) return
      if (blob.size > X_IMAGE_LIMIT) {
        toast(
          `Saved, but it is ${formatBytes(blob.size)}. X accepts images up to 5 MB; try JPEG.`,
          {
            tone: 'warning',
          },
        )
      } else {
        savedToast(path, ` (${formatBytes(blob.size)})`)
      }
    })

  const deleteSelected = () => {
    if (!selectedId) return
    history.update((c) => ({ ...c, redactions: c.redactions.filter((r) => r.id !== selectedId) }))
    setSelectedId(null)
  }

  useKeydown((e) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void save()
      return
    }
    if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault()
      fileInput.current?.click()
      return
    }
    if (
      mod &&
      e.key.toLowerCase() === 'c' &&
      !isTextInput(e.target) &&
      !window.getSelection()?.toString()
    ) {
      e.preventDefault()
      void copy()
      return
    }
    if (!image) return
    const handled = handleEditorKey(e, {
      mode,
      setMode,
      undo: history.undo,
      redo: history.redo,
      deleteSelected,
      deselect: () => setSelectedId(null),
    })
    if (handled) e.preventDefault()
  })

  // Edit → Copy in the menu bar
  useWindowEvent('copy', (e) => {
    if (isTextInput(e.target) || window.getSelection()?.toString()) return
    e.preventDefault()
    void copy()
  })

  useWindowEvent('paste', (e) => {
    if (isTextInput(e.target)) return
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (file) {
      e.preventDefault()
      void load(file)
    }
  })

  const dragging = useFileDrop(
    (f) => f.type.startsWith('image/'),
    (f) => void load(f),
  )

  const openInput = (
    <input
      ref={fileInput}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) void load(file)
        e.target.value = ''
      }}
    />
  )

  if (!image || !layout) {
    return (
      <div className="flex h-full flex-col">
        <TitleBar>
          <span className="text-[13px] font-medium text-neutral-400">Screenshot editor</span>
        </TitleBar>
        <EmptyState
          icon={ImagePlus}
          title="Make an image ready for X"
          description="Open an image, paste one, or drop it here. Then crop it, blur private details, round the corners and place it on a background in an X post size."
        >
          <Button variant="primary" icon={FolderOpen} onClick={() => fileInput.current?.click()}>
            Open image
          </Button>
          <Button icon={ClipboardPaste} onClick={pasteFromClipboard}>
            Paste
          </Button>
          <Button
            icon={Camera}
            variant="ghost"
            onClick={() => window.api.tools.launch('screenshot')}
          >
            Take a screenshot
          </Button>
        </EmptyState>
        {openInput}
        <DropOverlay show={dragging} label="Drop to open the image" />
      </div>
    )
  }

  const tools: { mode: StageMode; icon: typeof Crop; label: string; key: string }[] = [
    { mode: 'select', icon: MousePointer2, label: 'Select', key: 'V' },
    { mode: 'crop', icon: Crop, label: 'Crop', key: 'C' },
    { mode: 'blur', icon: Droplets, label: 'Blur or pixelate an area', key: 'B' },
  ]

  return (
    <div className="flex h-full flex-col">
      <TitleBar>
        {tools.map((t) => (
          <IconButton
            key={t.mode}
            icon={t.icon}
            label={t.label}
            shortcut={t.key}
            active={mode === t.mode}
            onClick={() => setMode(t.mode)}
          />
        ))}
        <ToolbarDivider />
        <IconButton
          icon={Undo2}
          label="Undo"
          shortcut={`${modKey}Z`}
          disabled={!history.canUndo}
          onClick={history.undo}
        />
        <IconButton
          icon={Redo2}
          label="Redo"
          shortcut={`${modKey}⇧Z`}
          disabled={!history.canRedo}
          onClick={history.redo}
        />
        <ToolbarDivider />
        <IconButton
          icon={FolderOpen}
          label="Open another image"
          shortcut={`${modKey}O`}
          onClick={() => fileInput.current?.click()}
        />
        <IconButton icon={ClipboardPaste} label="Paste image" onClick={pasteFromClipboard} />
        <div className="flex-1" />
        <span className="mr-2 text-xs text-neutral-500 tabular-nums">
          {layout.width} × {layout.height}
        </span>
        <Button icon={Copy} loading={busy === 'copy'} onClick={copy} title={`Copy (${modKey}C)`}>
          Copy
        </Button>
        <Button
          variant="primary"
          icon={Download}
          loading={busy === 'save'}
          onClick={save}
          title={`Save (${modKey}S)`}
        >
          Save
        </Button>
      </TitleBar>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col bg-neutral-950">
          <Stage
            source={image}
            width={image.width}
            height={image.height}
            comp={comp}
            frames={IMAGE_FRAMES}
            mode={mode}
            onModeChange={setMode}
            update={history.update}
            selectedId={selectedId}
            onSelect={setSelectedId}
            backgroundImage={backgroundImage}
            newRedaction={defaults}
          />
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-neutral-800/80 bg-neutral-950">
          <StyleSections
            comp={comp}
            update={history.update}
            frames={IMAGE_FRAMES}
            autoSize={layout}
          />
          <RedactionSection
            comp={comp}
            update={history.update}
            selectedId={selectedId}
            onSelect={setSelectedId}
            defaults={defaults}
            onDefaultsChange={setDefaults}
          />
          <Section title="Export">
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'jpeg', label: 'JPEG' },
              ]}
            />
            <p className="mt-2.5 text-xs leading-relaxed text-neutral-500">
              PNG keeps text sharp. JPEG makes smaller files; X accepts images up to 5 MB.
            </p>
          </Section>
        </aside>
      </div>
      {openInput}
      <DropOverlay show={dragging} label="Drop to open the image" />
    </div>
  )
}
