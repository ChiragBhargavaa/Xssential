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
import { Button, IconButton, Section, TitleBar, ToolbarDivider, XLogo } from '../components/ui'
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
import { useXAccount } from '../lib/x'

const STYLE_KEY = 'xssential.image-style.v2'

export default function ImageEditor() {
  const [image, setImage] = useState<ImageBitmap | null>(null)
  const history = useHistory<Composition>(() => loadStyle(STYLE_KEY, IMAGE_FRAMES))
  const { reset } = history
  const comp = history.value
  const [mode, setMode] = useState<StageMode>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [defaults, setDefaults] = useState<RedactionDefaults>({ strength: 60 })
  const [busy, setBusy] = useState<'copy' | 'save' | null>(null)
  // True while X's composer (or its sign-in page) is open
  const [posting, setPosting] = useState(false)
  const [xAccount, refreshXAccount] = useXAccount()
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
          ? `Copied (${formatBytes(blob.size)}). X may reject images over 5 MB; download it as a JPEG instead.`
          : 'Copied. Paste it straight into a post.',
        { tone: blob.size > X_IMAGE_LIMIT ? 'warning' : 'success' },
      )
    })

  const save = () =>
    run('save', async () => {
      if (!image || !layout) return
      const blob = await renderToBlob(image, layout, comp, 'jpeg', backgroundImage)
      const path = await window.api.files.save({
        data: await blobToBytes(blob),
        name: timestampName('Xssential', 'jpg'),
        kind: 'image',
        filters: [{ name: 'JPEG image', extensions: ['jpg'] }],
      })
      if (!path) return
      if (blob.size > X_IMAGE_LIMIT) {
        toast(`Saved, but it is ${formatBytes(blob.size)}. X accepts images up to 5 MB.`, {
          tone: 'warning',
        })
      } else {
        savedToast(path, ` (${formatBytes(blob.size)})`)
      }
    })

  const postToX = async () => {
    if (!image || !layout || posting) return
    setPosting(true)
    try {
      const blob = await renderToBlob(image, layout, comp, 'jpeg', backgroundImage)
      const result = await window.api.x.post(await blobToBytes(blob))
      if (result === 'posted') toast('Posted to X.', { tone: 'success' })
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' })
    } finally {
      setPosting(false)
      refreshXAccount()
    }
  }

  const signInToX = async () => {
    await window.api.x.signIn()
    refreshXAccount()
  }

  const signOutOfX = async () => {
    await window.api.x.signOut()
    refreshXAccount()
    toast('Signed out of X.')
  }

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
          <span className="text-[13px] font-medium text-neutral-600">Screenshot editor</span>
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
    { mode: 'blur', icon: Droplets, label: 'Blur an area', key: 'B' },
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
        <span className="mr-2 text-xs text-neutral-600 tabular-nums">
          {layout.width} × {layout.height}
        </span>
      </TitleBar>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col bg-neutral-50">
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

        <aside className="flex w-80 shrink-0 flex-col border-l border-neutral-100 bg-white">
          <div className="min-h-0 flex-1 overflow-y-auto">
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
          </div>
          {/* Pinned below the scrolling settings so the image can always be sent off */}
          <Section title="Export" className="border-t">
            <div className="grid grid-cols-2 gap-2">
              <Button
                icon={Download}
                loading={busy === 'save'}
                onClick={save}
                title={`Download as JPEG (${modKey}S)`}
              >
                Download
              </Button>
              <Button
                icon={Copy}
                loading={busy === 'copy'}
                onClick={copy}
                title={`Copy to the clipboard (${modKey}C)`}
              >
                Copy
              </Button>
            </div>
            <Button variant="primary" loading={posting} onClick={postToX} className="mt-2 w-full">
              {!posting && <XLogo className="size-3.5" />}
              Post on X
            </Button>
            <p className="mt-2.5 text-xs leading-relaxed text-neutral-600">
              {xAccount?.signedIn ? (
                <>
                  Posting as{' '}
                  <span className="font-bold text-neutral-900">
                    {xAccount.handle ? `@${xAccount.handle}` : 'your X account'}
                  </span>{' '}
                  ·{' '}
                  <button
                    type="button"
                    onClick={signOutOfX}
                    className="font-bold text-neutral-900 hover:underline"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={signInToX}
                    className="font-bold text-neutral-900 hover:underline"
                  >
                    Sign in to X
                  </button>{' '}
                  to post. You sign in on X&apos;s own page, so Xssential never sees your password.
                </>
              )}
            </p>
          </Section>
        </aside>
      </div>
      {openInput}
      <DropOverlay show={dragging} label="Drop to open the image" />
    </div>
  )
}
