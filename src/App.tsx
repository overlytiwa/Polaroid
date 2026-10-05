import './App.css'
import Camera from './components/camera'
import CaptureButton from './components/captureButton'
import ControlButton from './components/controlButton'

function App() {
  return (
    <>
      <main className='digicam'>
        <section className='camera-view-panel'>
          <Camera />
        </section>
        <section className='camera-controls-panel'>
          <div className='camera-controls-panel-section left'>
            
          </div>
          <div className='camera-controls-panel-section center'>
            <CaptureButton/>
          </div>
          <div className='camera-controls-panel-section right'>
            <ControlButton icon='lucide:flashlight' label='Flashlight' />
            <ControlButton icon='lucide:rotate-cw' label='Flip camera' />
          </div>
        </section>
      </main>
    </>
  )
}

export default App
