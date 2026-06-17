import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'

const PITCH_META = {
  FF: { velo: 94, spin: 2380, col: 0xE24B4A, hex: '#E24B4A' },
  SI: { velo: 93, spin: 2100, col: 0xE8823A, hex: '#E8823A' },
  FC: { velo: 90, spin: 2380, col: 0xF5C518, hex: '#F5C518' },
  SL: { velo: 86, spin: 2550, col: 0x378ADD, hex: '#378ADD' },
  ST: { velo: 83, spin: 2660, col: 0x9F67D4, hex: '#9F67D4' },
  CU: { velo: 79, spin: 2780, col: 0xBA7517, hex: '#BA7517' },
  KC: { velo: 75, spin: 2500, col: 0xD4A017, hex: '#D4A017' },
  CH: { velo: 84, spin: 1820, col: 0x639922, hex: '#639922' },
  FS: { velo: 83, spin: 1600, col: 0x22A68A, hex: '#22A68A' },
}

const DEFAULT_META = { velo: 90, spin: 2200, col: 0x888888, hex: '#888888' }

function createSeamTexture() {
  const cv = document.createElement('canvas')
  cv.width = 512; cv.height = 512
  const cx = cv.getContext('2d')
  cx.fillStyle = '#f5f0e8'; cx.fillRect(0, 0, 512, 512)
  const curve = (pts, w = 5) => {
    cx.strokeStyle = '#cc2222'; cx.lineWidth = w; cx.lineCap = 'round'
    cx.beginPath(); cx.moveTo(...pts[0])
    pts.slice(1).forEach(p => cx.lineTo(...p)); cx.stroke()
  }
  curve([[160,70],[170,130],[175,200],[170,280],[160,350],[165,430]])
  curve([[352,70],[342,130],[337,200],[342,280],[352,350],[347,430]])
  for (let i = 0; i < 7; i++) {
    const y = 90 + i * 52
    cx.strokeStyle = '#cc2222'; cx.lineWidth = 3.5; cx.lineCap = 'round'
    cx.save(); cx.translate(160 + (i % 2 === 0 ? -6 : 6), y); cx.rotate(0.35)
    cx.beginPath(); cx.moveTo(-9, 0); cx.lineTo(9, 0); cx.stroke(); cx.restore()
    cx.save(); cx.translate(352 - (i % 2 === 0 ? -6 : 6), y); cx.rotate(-0.35)
    cx.beginPath(); cx.moveTo(-9, 0); cx.lineTo(9, 0); cx.stroke(); cx.restore()
  }
  return new THREE.CanvasTexture(cv)
}

function buildScene(canvas, rec) {
  const W = canvas.offsetWidth || 760, H = 460
  const meta = PITCH_META[rec.pitch_type] || DEFAULT_META
  const pfxXft = rec.avg_pfx_x ?? 0
  const pfxZft = rec.avg_pfx_z ?? 0

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setSize(W, H, false)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x06080f)
  scene.fog = new THREE.FogExp2(0x06080f, 0.016)

  const camera = new THREE.PerspectiveCamera(56, W / H, 0.1, 200)
  camera.position.set(0.4, 1.9, -3.5)
  camera.lookAt(0, 1.7, 16)

  const lookAt = new THREE.Vector3(0, 1.7, 10)
  let theta = 0.07, phi = 0.22, radius = 21
  let tTheta = theta, tPhi = phi, tRadius = radius
  let dragging = false, lmx = 0, lmy = 0

  canvas.addEventListener('mousedown', e => { dragging = true; lmx = e.clientX; lmy = e.clientY })
  window.addEventListener('mouseup', () => { dragging = false })
  canvas.addEventListener('mousemove', e => {
    if (!dragging) return
    tTheta -= (e.clientX - lmx) * 0.007
    tPhi = Math.max(0.06, Math.min(1.35, tPhi - (e.clientY - lmy) * 0.006))
    lmx = e.clientX; lmy = e.clientY
  })
  canvas.addEventListener('wheel', e => {
    tRadius = Math.max(7, Math.min(45, tRadius + e.deltaY * 0.016))
    e.preventDefault()
  }, { passive: false })

  scene.add(new THREE.AmbientLight(0xffffff, 0.22))
  const sun = new THREE.DirectionalLight(0xfff8e8, 1.0)
  sun.position.set(8, 18, 12); sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = -25; sun.shadow.camera.right = 25
  sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25
  scene.add(sun)
  scene.add(Object.assign(new THREE.DirectionalLight(0x8899cc, 0.3), { position: new THREE.Vector3(-10, 8, -5) }))

  ;[[-18, 14, -4], [18, 14, -4], [-18, 14, 22], [18, 14, 22]].forEach(([px, py, pz]) => {
    const l = new THREE.PointLight(0xfff4cc, 0.45, 55); l.position.set(px, py, pz); scene.add(l)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, py, 8), new THREE.MeshLambertMaterial({ color: 0x777777 }))
    pole.position.set(px, py / 2, pz); pole.castShadow = true; scene.add(pole)
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 0.4), new THREE.MeshLambertMaterial({ color: 0xffffee }))
    head.position.set(px, py + 0.14, pz); scene.add(head)
  })

  for (let i = 0; i < 9; i++) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(55, 3),
      new THREE.MeshLambertMaterial({ color: i % 2 === 0 ? 0x1a3d0a : 0x163308 })
    )
    strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0, i * 3 - 4); strip.receiveShadow = true; scene.add(strip)
  }
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(55, 12), new THREE.MeshLambertMaterial({ color: 0x1a3d0a }))
  backing.rotation.x = -Math.PI / 2; backing.position.set(0, 0, -8); backing.receiveShadow = true; scene.add(backing)

  const dirt = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshLambertMaterial({ color: 0x6b4020 }))
  dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.005; scene.add(dirt)

  const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, 0.44, 32), new THREE.MeshLambertMaterial({ color: 0x7a5228 }))
  mound.position.set(0, 0.22, 16); mound.castShadow = true; mound.receiveShadow = true; scene.add(mound)
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.18), new THREE.MeshLambertMaterial({ color: 0xffffff }))
  rubber.position.set(0, 0.47, 16); scene.add(rubber)

  const plateShape = new THREE.Shape()
  plateShape.moveTo(-0.72, -0.48); plateShape.lineTo(0.72, -0.48)
  plateShape.lineTo(0.72, 0.08); plateShape.lineTo(0, 0.48); plateShape.lineTo(-0.72, 0.08); plateShape.closePath()
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape), new THREE.MeshLambertMaterial({ color: 0xf8f4ee }))
  plate.rotation.x = -Math.PI / 2; plate.position.y = 0.02; scene.add(plate)

  const addLine = (pts, col = 0x777777, op = 0.35) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
    scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op })))
  }
  addLine([[-1.5, 0.01, -0.9], [-1.5, 0.01, 1.1], [1.5, 0.01, 1.1], [1.5, 0.01, -0.9], [-1.5, 0.01, -0.9]])
  addLine([[-0.72, 0.01, -0.9], [-0.72, 0.01, 1.1]])
  addLine([[0.72, 0.01, -0.9], [0.72, 0.01, 1.1]])

  const szGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.68, 1.85, 0.04))
  const szMat = new THREE.LineBasicMaterial({ color: 0x1D9E75, transparent: true, opacity: 0.7 })
  const sz = new THREE.LineSegments(szGeo, szMat); sz.position.set(0, 2.57, 0.28); scene.add(sz)
  const szFace = new THREE.Mesh(
    new THREE.PlaneGeometry(1.68, 1.85),
    new THREE.MeshBasicMaterial({ color: 0x1D9E75, transparent: true, opacity: 0.05, side: THREE.DoubleSide })
  )
  szFace.position.set(0, 2.57, 0.28); scene.add(szFace)

  const mkFig = (zPos, bodyCol, hatCol, isRHP) => {
    const g = new THREE.Group()
    const mat = c => new THREE.MeshLambertMaterial({ color: c })
    const add = (geo, col, pos, rot) => {
      const m = new THREE.Mesh(geo, mat(col)); m.position.set(...pos)
      if (rot) { m.rotation.x = rot[0] ?? 0; m.rotation.y = rot[1] ?? 0; m.rotation.z = rot[2] ?? 0 }
      m.castShadow = true; g.add(m)
    }
    add(new THREE.SphereGeometry(0.19, 10, 8), bodyCol, [0, 2.38, zPos])
    add(new THREE.CylinderGeometry(0.09, 0.22, 0.22, 8), hatCol, [0, 2.6, zPos])
    add(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), hatCol, [0, 2.5, zPos])
    add(new THREE.CylinderGeometry(0.19, 0.17, 0.72, 8), bodyCol, [0, 1.84, zPos])
    add(new THREE.CylinderGeometry(0.08, 0.07, 0.62, 8), bodyCol, [-0.12, 1.12, zPos])
    add(new THREE.CylinderGeometry(0.08, 0.07, 0.62, 8), bodyCol, [0.12, 1.12, zPos])
    add(new THREE.BoxGeometry(0.16, 0.07, 0.28), bodyCol, [-0.12, 0.78, zPos + 0.06])
    add(new THREE.BoxGeometry(0.16, 0.07, 0.28), bodyCol, [0.12, 0.78, zPos + 0.06])
    const aX = isRHP ? -0.32 : 0.32
    add(new THREE.CylinderGeometry(0.065, 0.055, 0.52, 8), bodyCol, [aX, 1.95, zPos], [0, 0, isRHP ? 1.1 : -1.1])
    add(new THREE.CylinderGeometry(0.065, 0.055, 0.5, 8), bodyCol, [-aX, 1.82, zPos], [0, 0, isRHP ? -0.55 : 0.55])
    add(new THREE.SphereGeometry(0.12, 8, 6), 0x5c3310, [-aX + (isRHP ? 0.2 : -0.2), 1.58, zPos])
    scene.add(g)
    return g
  }
  mkFig(16.2, 0x1a3d8a, 0x0a1a4a, true)
  mkFig(0.55, 0x1a1a3a, 0x050510, false)

  const bat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.025, 0.95, 8),
    new THREE.MeshLambertMaterial({ color: 0x8B3A0A })
  )
  bat.position.set(-0.68, 1.9, 0.55); bat.rotation.z = -0.38; bat.rotation.x = 0.18
  bat.castShadow = true; scene.add(bat)

  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 20, 16),
    new THREE.MeshPhongMaterial({ map: createSeamTexture(), shininess: 55, specular: new THREE.Color(0x444444) })
  )
  ballMesh.castShadow = true; ballMesh.visible = false; scene.add(ballMesh)

  const MAX_T = 55
  const trailBuf = new Float32Array(MAX_T * 3)
  const trailGeo = new THREE.BufferGeometry()
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailBuf, 3))
  const trailMat = new THREE.LineBasicMaterial({ color: new THREE.Color(meta.hex), transparent: true, opacity: 0 })
  const trail = new THREE.Line(trailGeo, trailMat)
  trail.visible = false; scene.add(trail)

  const PCOUNT = 60
  const pBuf = new Float32Array(PCOUNT * 3)
  const pVel = Array.from({ length: PCOUNT }, () => {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI
    const sp = 0.06 + Math.random() * 0.11
    return new THREE.Vector3(Math.sin(ph) * Math.cos(th) * sp, Math.sin(ph) * Math.sin(th) * sp, Math.cos(ph) * sp)
  })
  const pGeo = new THREE.BufferGeometry()
  pGeo.setAttribute('position', new THREE.BufferAttribute(pBuf, 3))
  const pMat = new THREE.PointsMaterial({ size: 0.11, color: new THREE.Color(meta.hex), transparent: true, opacity: 0 })
  const parts = new THREE.Points(pGeo, pMat); scene.add(parts)

  let trailPts = [], pActive = false, pT = 0
  let animating = false, frozen = false, animStart = null
  let batT = 0, batSwing = false
  let onFreezeCallback = null

  function getBallPos(t) {
    const rx = -0.5, ry = 2.1, rz = 15.6
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    const lateSq = Math.max(0, (t - 0.4) / 0.6) ** 2
    const targetX = rx + pfxXft * 0.8
    const targetY = 1.85 + pfxZft * 0.28
    const x = rx + (targetX - rx) * ease + pfxXft * lateSq * 0.62
    const z = rz - (rz - 0.35) * ease
    const y = ry + (targetY - ry) * ease - 1.35 * t * t + pfxZft * lateSq * 0.38
    return new THREE.Vector3(x, y, z)
  }

  let rafId = null
  const clock = { start: null }

  function tick(now) {
    rafId = requestAnimationFrame(tick)

    theta += (tTheta - theta) * 0.07
    phi += (tPhi - phi) * 0.07
    radius += (tRadius - radius) * 0.07
    const sp = Math.sin(phi), cp = Math.cos(phi), st = Math.sin(theta), ct = Math.cos(theta)
    camera.position.set(lookAt.x + radius * sp * st, lookAt.y + radius * cp, lookAt.z + radius * sp * ct)
    camera.lookAt(lookAt)

    if (animating && !frozen) {
      if (!animStart) animStart = now
      const t = Math.min((now - animStart) / 1300, 1)
      const pos = getBallPos(t)
      ballMesh.position.copy(pos)
      ballMesh.rotation.x += 0.2; ballMesh.rotation.z += 0.13

      trailPts.push(pos.clone())
      if (trailPts.length > MAX_T) trailPts.shift()
      const ta = trailGeo.attributes.position.array
      for (let i = 0; i < MAX_T; i++) {
        const pt = trailPts[i] || pos
        ta[i * 3] = pt.x; ta[i * 3 + 1] = pt.y; ta[i * 3 + 2] = pt.z
      }
      trailGeo.attributes.position.needsUpdate = true
      trailGeo.setDrawRange(0, trailPts.length)
      trailMat.opacity = Math.min(0.5, t * 0.9)

      if (t >= 1) {
        frozen = true; animating = false
        const finalPos = getBallPos(1)
        pBuf.fill(0)
        for (let i = 0; i < PCOUNT; i++) { pBuf[i * 3] = finalPos.x; pBuf[i * 3 + 1] = finalPos.y; pBuf[i * 3 + 2] = finalPos.z }
        pGeo.attributes.position.needsUpdate = true
        pMat.color = new THREE.Color(meta.hex); pMat.opacity = 1; pActive = true; pT = 0
        batSwing = true; batT = 0
        const inZone = Math.abs(finalPos.x) <= 0.84 && finalPos.y >= 1.5 && finalPos.y <= 3.5
        szMat.color = new THREE.Color(inZone ? 0x1D9E75 : 0xE24B4A)
        szFace.material.color = new THREE.Color(inZone ? 0x1D9E75 : 0xE24B4A)
        szFace.material.opacity = inZone ? 0.12 : 0.06
        if (onFreezeCallback) onFreezeCallback(inZone)
      }
    }

    if (pActive) {
      pT += 0.04
      const pa = pGeo.attributes.position.array
      for (let i = 0; i < PCOUNT; i++) {
        pa[i * 3] += pVel[i].x; pa[i * 3 + 1] += pVel[i].y - 0.003; pa[i * 3 + 2] += pVel[i].z
      }
      pGeo.attributes.position.needsUpdate = true
      pMat.opacity = Math.max(0, 1 - pT)
      if (pT > 1) pActive = false
    }

    if (batSwing) {
      batT += 0.065
      bat.rotation.z = -0.38 + Math.sin(Math.min(batT, Math.PI)) * -1.45
      if (batT >= Math.PI) batSwing = false
    }

    renderer.render(scene, camera)
  }

  const api = {
    throw(onFreeze) {
      if (animating || frozen) return
      onFreezeCallback = onFreeze
      animating = true; frozen = false; animStart = null; trailPts = []
      ballMesh.visible = true; trail.visible = true; trailMat.opacity = 0
    },
    reset() {
      animating = false; frozen = false; animStart = null; trailPts = []
      ballMesh.visible = false; trail.visible = false; trailMat.opacity = 0
      pActive = false; pMat.opacity = 0; batSwing = false; bat.rotation.z = -0.38
      szMat.color = new THREE.Color(0x1D9E75)
      szFace.material.color = new THREE.Color(0x1D9E75); szFace.material.opacity = 0.05
    },
    start() { rafId = requestAnimationFrame(tick) },
    stop() { cancelAnimationFrame(rafId); renderer.dispose() },
    getVelo(t) { return Math.round(meta.velo * (1 - 0.07 * (t || 0))) },
    meta,
  }
  return api
}

function deriveProbs(rec) {
  const whiff = rec.whiff_rate ?? 0.2
  const chase = rec.chase_rate ?? 0.25
  const xwoba = rec.avg_xwoba ?? 0.320
  const miss = Math.round(whiff * 100)
  const cs = Math.round((rec.score_components?.called_strike ?? 0.05) * 200)
  const ball = Math.round((1 - chase) * 18)
  const foul = Math.round(whiff * 65)
  const weak = Math.round((0.500 - Math.min(xwoba, 0.5)) * 80)
  const hard = Math.max(0, 100 - miss - cs - ball - foul - weak)
  return [
    { l: 'Swing & miss', v: miss, c: '#378ADD' },
    { l: 'Foul ball', v: foul, c: '#888780' },
    { l: 'Weak contact', v: weak, c: '#639922' },
    { l: 'Hard contact', v: hard, c: '#E24B4A' },
    { l: 'Called strike', v: cs, c: '#1D9E75' },
    { l: 'Ball', v: ball, c: '#5F5E5A' },
  ]
}

export default function PitchAnimation3D({ rec, onClose }) {
  const canvasRef = useRef(null)
  const sceneApi = useRef(null)
  const [thrown, setThrown] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [velo, setVelo] = useState(null)
  const [flash, setFlash] = useState(false)
  const [showProbs, setShowProbs] = useState(false)
  const [inZone, setInZone] = useState(null)
  const veloRef = useRef(null)
  const animFrame = useRef(null)

  const meta = PITCH_META[rec.pitch_type] || DEFAULT_META
  const probs = deriveProbs(rec)
  const pfxXin = rec.avg_pfx_x != null ? Math.round(rec.avg_pfx_x * 12) : null
  const pfxZin = rec.avg_pfx_z != null ? Math.round(rec.avg_pfx_z * 12) : null

  useEffect(() => {
    const api = buildScene(canvasRef.current, rec)
    sceneApi.current = api
    api.start()
    return () => api.stop()
  }, [rec])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleThrow = useCallback(() => {
    if (!sceneApi.current) return
    setThrown(true); setFrozen(false); setShowProbs(false); setVelo(null); setInZone(null)

    let startTime = null
    const veloInterval = (now) => {
      if (!startTime) startTime = now
      const t = Math.min((now - startTime) / 1300, 1)
      setVelo(sceneApi.current.getVelo(t))
      if (t < 1) veloRef.current = requestAnimationFrame(veloInterval)
    }
    veloRef.current = requestAnimationFrame(veloInterval)

    sceneApi.current.throw((iz) => {
      cancelAnimationFrame(veloRef.current)
      setVelo(null); setFrozen(true); setInZone(iz)
      setFlash(true)
      setTimeout(() => setFlash(false), 180)
      setTimeout(() => setShowProbs(true), 300)
    })
  }, [])

  const handleReset = useCallback(() => {
    sceneApi.current?.reset()
    setThrown(false); setFrozen(false); setShowProbs(false); setVelo(null); setInZone(null)
    cancelAnimationFrame(veloRef.current)
  }, [])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ position: 'relative', width: 760, maxWidth: '96vw', background: '#060a14', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.09)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: meta.hex, display: 'inline-block' }} />
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{rec.pitch_label}</span>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontFamily: 'monospace' }}>{rec.pitch_type}</span>
            {pfxXin != null && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>H {pfxXin > 0 ? '+' : ''}{pfxXin}"  V {pfxZin > 0 ? '+' : ''}{pfxZin}"</span>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {/* Canvas */}
        <div style={{ position: 'relative' }}>
          <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 460 }} />

          {/* Flash overlay */}
          <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flash ? 0.5 : 0, pointerEvents: 'none', transition: flash ? 'none' : 'opacity .35s' }} />

          {/* Velocity live readout */}
          {velo != null && (
            <div style={{ position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)', background: 'rgba(4,8,20,0.85)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '5px 20px', fontSize: 20, fontWeight: 500, color: '#fff', pointerEvents: 'none' }}>
              {velo} mph
            </div>
          )}

          {/* Zone result badge */}
          {frozen && inZone != null && (
            <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', background: inZone ? 'rgba(29,158,117,0.2)' : 'rgba(226,75,74,0.2)', border: `1px solid ${inZone ? '#1D9E75' : '#E24B4A'}`, borderRadius: 20, padding: '4px 16px', fontSize: 12, fontWeight: 600, color: inZone ? '#34d399' : '#f87171', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              {inZone ? '✓ In zone' : '✗ Off the zone'}
            </div>
          )}

          {/* Probability panel */}
          {showProbs && (
            <div style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(4,8,20,0.82)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '11px 14px', minWidth: 185 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 9 }}>Result probabilities</div>
              {probs.map(p => (
                <div key={p.l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.c, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', flex: 1 }}>{p.l}</span>
                  <div style={{ width: 52, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${p.v}%`, background: p.c, borderRadius: 2, transition: 'width .9s cubic-bezier(.4,0,.2,1)' }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#fff', fontWeight: 500, width: 26, textAlign: 'right' }}>{p.v}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Metrics panel */}
          {showProbs && (
            <div style={{ position: 'absolute', top: 14, left: 14, background: 'rgba(4,8,20,0.82)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '11px 14px', minWidth: 150 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 9 }}>Pitch metrics</div>
              {[
                ['Velocity', `~${meta.velo} mph`],
                ['Spin rate', `${meta.spin.toLocaleString()} rpm`],
                ['Whiff %', rec.whiff_rate != null ? `${(rec.whiff_rate * 100).toFixed(1)}%` : '—'],
                ['xwOBA', rec.avg_xwoba != null ? rec.avg_xwoba.toFixed(3) : '—'],
                pfxXin != null && ['H-break', `${pfxXin > 0 ? '+' : ''}${pfxXin}"`],
                pfxZin != null && ['V-break', `${pfxZin > 0 ? '+' : ''}${pfxZin}"`],
              ].filter(Boolean).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{k}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: meta.hex }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Camera hint */}
          {!thrown && (
            <div style={{ position: 'absolute', bottom: 58, right: 14, fontSize: 10, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }}>drag · scroll to zoom</div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {!thrown || frozen ? (
            <>
              {frozen && (
                <button onClick={handleReset} style={{ padding: '7px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.55)', fontSize: 12, cursor: 'pointer' }}>
                  ↺ Reset
                </button>
              )}
              <button
                onClick={handleThrow}
                disabled={thrown && !frozen}
                style={{ padding: '8px 26px', borderRadius: 14, border: 'none', background: meta.hex, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (thrown && !frozen) ? 0.4 : 1 }}
              >
                ⚾ {frozen ? 'Throw again' : 'Throw pitch'}
              </button>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', padding: '8px 0' }}>In flight…</div>
          )}
        </div>
      </div>
    </div>
  )
}
