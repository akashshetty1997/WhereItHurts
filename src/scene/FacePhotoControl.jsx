// Use My Photo: put your own face on the 3D patient (Testing mode or PT). The photo stays in this
// browser; src/scene/facePhoto.js does the work.
import { useRef, useState } from 'react'
import { Camera, LoaderCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { setFacePhoto } from './bodyApi'
import { readPhoto, savePhoto, forgetPhoto, hasSavedPhoto, FacePhotoError } from './facePhoto'

export default function FacePhotoControl() {
  const input = useRef(null)
  const [state, setState] = useState(() => (hasSavedPhoto() ? 'done' : 'idle')) // idle | working | done | error
  const [message, setMessage] = useState(null)

  async function use(file) {
    if (!file) return
    setState('working')
    setMessage('Finding your face…')
    try {
      const photo = await readPhoto(file)
      await setFacePhoto(photo)
      savePhoto(photo)
      setState('done')
      setMessage('Your face is on the 3D patient. The photo stays on this computer.')
    } catch (error) {
      console.error('Use My Photo failed', error)
      setState('error')
      setMessage(
        error instanceof FacePhotoError
          ? error.message
          : 'Couldn’t load the face finder. Check the internet connection and try again.',
      )
    }
  }

  async function reset() {
    forgetPhoto()
    setState('idle')
    setMessage(null)
    await setFacePhoto(null).catch((error) => console.error('Reset face failed', error))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-muted-foreground">Face</span>
        <div className="flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 font-bold"
            disabled={state === 'working'}
            onClick={() => input.current?.click()}
          >
            {state === 'working' ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Camera className="size-4" aria-hidden />
            )}
            {state === 'done' ? 'Change Photo' : 'Use My Photo'}
          </Button>
          {state === 'done' && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={reset} title="Back to the model’s own face">
              <RotateCcw className="size-4" aria-hidden />
              Reset
            </Button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          use(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {message && (
        <p className={cn('text-sm leading-snug', state === 'error' ? 'text-flag' : 'text-muted-foreground')} aria-live="polite">
          {message}
        </p>
      )}
    </div>
  )
}
