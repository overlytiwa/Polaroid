import { useRef, useState, useCallback, useEffect } from 'react'
import './App.css'
import Camera, { type CameraHandle } from './components/camera'
import CaptureButton from './components/captureButton'
import ControlButton from './components/controlButton'
import GalleryModal from './components/GalleryModal'
import { usePhotos } from './lib/usePhotos'
import shutterSoundUrl from './assets/sounds/camera_shutter.mp3'
import iconUrl from './assets/images/icon.png'
import overlyUrl from './assets/images/overly.svg'

let _audioCtx: AudioContext | null = null
let _shutterBuf: AudioBuffer | null = null

function getCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext()
  return _audioCtx
}

fetch(shutterSoundUrl)
  .then((r) => r.arrayBuffer())
  .then((ab) => getCtx().decodeAudioData(ab))
  .then((buf) => { _shutterBuf = buf })
  .catch(() => {})

function playShutter() {
  const ctx = getCtx()
  if (!_shutterBuf) return
  if (ctx.state === 'suspended') ctx.resume()
  const src = ctx.createBufferSource()
  src.buffer = _shutterBuf
  src.connect(ctx.destination)
  src.start(0)
}

function App() {
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const cameraRef = useRef<CameraHandle>(null)
  const { photos, addPhoto, deletePhoto } = usePhotos()
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isFading, setIsFading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFading(true)
      const removeTimer = setTimeout(() => {
        setIsLoading(false)
      }, 450)
      return () => clearTimeout(removeTimer)
    }, 1800)
    return () => clearTimeout(timer)
  }, [])

  const flipCamera = () =>
    setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))

  const handleCapture = useCallback(() => {
    playShutter()
    const dataUrl = cameraRef.current?.capture()
    if (dataUrl) addPhoto(dataUrl)
  }, [addPhoto])

  const openGallery = () => {
    if (photos.length === 0) return
    setGalleryIndex(photos.length - 1)
    setGalleryOpen(true)
  }

  const lastPhoto = photos[photos.length - 1]

  return (
    <>
      <div className='desktop-blocker' aria-hidden='true'>
        <div className='desktop-blocker-card'>
          <img src={iconUrl} alt='Polaroid' className='desktop-blocker-icon' />
          <h2 className='desktop-blocker-title'>Polaroid isn't built for desktop yet.</h2>
          <p className='desktop-blocker-desc'>
            Please open Polaroid on your Phone
          </p>
        </div>
      </div>

      {isLoading && (
        <div className={`loading-screen${isFading ? ' fade-out' : ''}`}>
          <div className='loading-content'>
            <img src={iconUrl} alt='Polaroid' className='loading-icon' />
            <h1 className='loading-title'>Polaroid</h1>
          </div>
          <div className='loading-bottom'>
            <img src={overlyUrl} alt='Polaroid' className='loading-bottom-img' />
          </div>
        </div>
      )}

      <main className='digicam'>
        <section className='camera-view-panel'>
          <Camera ref={cameraRef} facingMode={facingMode} />
        </section>
        <section className='camera-controls-panel'>
          <div className='camera-controls-panel-section left'>
            {/* Gallery thumbnail — bottom-left */}
            <button
              className='gallery-thumb-btn'
              aria-label='Open gallery'
              onClick={openGallery}
              disabled={photos.length === 0}
            >
              {lastPhoto ? (
                <img
                  src={lastPhoto.dataUrl}
                  alt='Last captured'
                  className='gallery-thumb-img'
                />
              ) : (
                <div className='gallery-thumb-empty' />
              )}
            </button>
          </div>
          <div className='camera-controls-panel-section center'>
            <CaptureButton onClick={handleCapture} aria-label='Take photo' />
          </div>
          <div className='camera-controls-panel-section right'>
            <ControlButton icon='lucide:rotate-cw' label='Flip camera' onClick={flipCamera} />
          </div>
        </section>
      </main>

      {galleryOpen && (
        <GalleryModal
          photos={photos}
          initialIndex={galleryIndex}
          onClose={() => setGalleryOpen(false)}
          onDelete={(id) => deletePhoto(id)}
        />
      )}
    </>
  )
}

export default App
