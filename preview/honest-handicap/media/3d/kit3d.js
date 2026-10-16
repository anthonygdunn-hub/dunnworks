// Honest Handicap: spinnable 3D kit (driver, iron, wedge, putter, ball).
// Generic shapes we model ourselves, never a real product. Loaded only when a viewer scrolls into view.
import * as THREE from './three.module.min.js';
import { RoomEnvironment } from './room-env.js';

const RED = 0xD21F25;

function mat(o) { return new THREE.MeshPhysicalMaterial(Object.assign({ metalness: .9, roughness: .25 }, o)); }

function shaft(lieDeg, from) {
  // hosel + shaft heading up and towards the heel at the lie angle
  const g = new THREE.Group();
  const hosel = new THREE.Mesh(new THREE.CylinderGeometry(.075, .095, .55, 24), mat({ color: 0x9aa0a6, roughness: .3 }));
  hosel.position.y = .27; g.add(hosel);
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(.034, .042, 7, 16), mat({ color: 0x2a2d31, metalness: .4, roughness: .35, clearcoat: 1 }));
  sh.position.y = .5 + 3.5; g.add(sh);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .12, 16), mat({ color: RED, metalness: .2, roughness: .4 }));
  band.position.y = 1.15; g.add(band);
  g.position.copy(from); g.rotation.z = THREE.MathUtils.degToRad(90 - lieDeg);
  return g;
}

function driver() {
  const s = new THREE.Shape();
  s.moveTo(-.85, .05); s.quadraticCurveTo(.05, -.08, .95, .05);
  s.bezierCurveTo(1.28, .35, 1.08, 1.0, .3, 1.12); s.bezierCurveTo(-.4, 1.2, -.98, .75, -1.02, .35); s.quadraticCurveTo(-1.04, .1, -.85, .05);
  const h = .5;
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: .16, bevelSize: .13, bevelSegments: 10, curveSegments: 64 });
  geo.rotateX(-Math.PI / 2); // extrusion becomes height, shape depth runs back along -z
  const p = geo.attributes.position, col = [], c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > h * .55) { // dome the crown
      const d = 1 - (x * x) / 1.25 - ((z + .58) * (z + .58)) / .5;
      y += Math.max(0, d) * .26; p.setY(i, y);
    }
    if (y > h * .62) c.set(0x121416);                     // crown
    else if (z > -.2 && y > -.1 && y < h + .05) c.set(0x3b3f45); // face
    else if (y < h * .25 && z < -.75) c.set(RED);          // back weight
    else c.set(0xc4c9ce);                                  // skirt and sole
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const head = new THREE.Mesh(geo, mat({ vertexColors: true, metalness: .55, roughness: .3, clearcoat: 1, clearcoatRoughness: .08 }));
  const g = new THREE.Group(); g.add(head);
  const aim = new THREE.Mesh(new THREE.BoxGeometry(.03, .01, .16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .5 }));
  aim.position.set(.05, h + .34, -.2); g.add(aim);
  g.add(shaft(58, new THREE.Vector3(-.92, h * .7, -.12)));
  g.position.set(0, -.45, .45);
  return { obj: g, tilt: .32 };
}

function iron(loftDeg, wedge) {
  const s = new THREE.Shape();
  if (wedge) {
    s.moveTo(-.8, 0); s.lineTo(.62, .02); s.quadraticCurveTo(1.0, .06, 1.02, .55); s.quadraticCurveTo(.98, .9, .58, .9); s.lineTo(-.7, .48); s.quadraticCurveTo(-.9, .4, -.8, 0);
  } else {
    s.moveTo(-.85, 0); s.lineTo(.72, .02); s.quadraticCurveTo(1.06, .05, 1.0, .45); s.quadraticCurveTo(.92, .76, .56, .74); s.lineTo(-.74, .43); s.quadraticCurveTo(-.93, .36, -.85, 0);
  }
  const chrome = mat({ color: 0xd9dde1, metalness: 1, roughness: .16 });
  const g = new THREE.Group(), blade = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(s, { depth: .1, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 4, curveSegments: 40 });
  geo.translate(0, 0, -.1);
  blade.add(new THREE.Mesh(geo, chrome));
  // muscle / cavity back
  const back = new THREE.Shape();
  back.moveTo(-.55, .06); back.lineTo(.8, .07); back.quadraticCurveTo(.92, .1, .88, .3); back.lineTo(-.5, .2); back.lineTo(-.55, .06);
  const bg = new THREE.ExtrudeGeometry(back, { depth: .1, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 3 });
  bg.translate(0, 0, -.24);
  blade.add(new THREE.Mesh(bg, mat({ color: 0xb7bcc2, metalness: 1, roughness: .35 })));
  const badge = new THREE.Mesh(new THREE.BoxGeometry(.32, .07, .02), mat({ color: RED, metalness: .3, roughness: .4 }));
  badge.position.set(.25, .2, -.27); blade.add(badge);
  // grooves
  const gm = new THREE.MeshStandardMaterial({ color: 0x55595e, metalness: .8, roughness: .5 });
  const n = wedge ? 11 : 9;
  for (let i = 0; i < n; i++) {
    const y = .1 + i * (wedge ? .062 : .05), w = (wedge ? 1.25 : 1.2) - i * .02;
    const gr = new THREE.Mesh(new THREE.BoxGeometry(w, .012, .01), gm);
    gr.position.set(.1 + i * .012, y, .035); blade.add(gr);
  }
  blade.rotation.x = -THREE.MathUtils.degToRad(loftDeg);
  g.add(blade);
  g.add(shaft(62, new THREE.Vector3(-.86, .3, -.05)));
  g.position.set(0, -.35, 0);
  return { obj: g, tilt: .18 };
}

function putter() {
  const s = new THREE.Shape(), w = 1.0, d = .24, r = .1;
  s.moveTo(-w + r, -d); s.lineTo(w - r, -d); s.quadraticCurveTo(w, -d, w, -d + r); s.lineTo(w, d - r); s.quadraticCurveTo(w, d, w - r, d);
  s.lineTo(-w + r, d); s.quadraticCurveTo(-w, d, -w, d - r); s.lineTo(-w, -d + r); s.quadraticCurveTo(-w, -d, -w + r, -d);
  const geo = new THREE.ExtrudeGeometry(s, { depth: .28, bevelEnabled: true, bevelThickness: .04, bevelSize: .04, bevelSegments: 5, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat({ color: 0x8e959c, metalness: 1, roughness: .32 })));
  const top = new THREE.Mesh(new THREE.BoxGeometry(.02, .01, .3), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  top.position.set(0, .325, 0); g.add(top);
  const insert = new THREE.Mesh(new THREE.BoxGeometry(1.2, .18, .02), mat({ color: 0x1b1b1b, metalness: .2, roughness: .6 }));
  insert.position.set(0, .15, .275); g.add(insert);
  const sole = new THREE.Mesh(new THREE.BoxGeometry(.5, .02, .12), mat({ color: RED, metalness: .3, roughness: .4 }));
  sole.position.set(.55, .33, -.12); g.add(sole);
  // plumber's neck
  const neck = new THREE.Group(), nm = mat({ color: 0x8e959c, metalness: 1, roughness: .3 });
  const a = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .22, 16), nm); a.position.set(-.55, .43, .05); neck.add(a);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .3, 16), nm); b.rotation.z = Math.PI / 2; b.position.set(-.67, .54, .05); neck.add(b);
  g.add(neck);
  g.add(shaft(72, new THREE.Vector3(-.82, .5, .05)));
  g.position.set(0, -.25, 0);
  return { obj: g, tilt: .3 };
}

function ball() {
  const geo = new THREE.SphereGeometry(1, 192, 144), p = geo.attributes.position, v = new THREE.Vector3();
  const N = 332, pts = [], ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = ga * i; pts.push(new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r)); }
  const R = .105;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let best = 9; for (const q of pts) { const d = v.distanceToSquared(q); if (d < best) best = d; }
    const dd = Math.sqrt(best);
    if (dd < R) { const k = 1 - dd / R; v.multiplyScalar(1 - .028 * (1 - (1 - k) * (1 - k))); p.setXYZ(i, v.x, v.y, v.z); }
  }
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .38, metalness: 0, clearcoat: 1, clearcoatRoughness: .15 })));
  const line = new THREE.Mesh(new THREE.TorusGeometry(1.0, .012, 8, 96, Math.PI * .55), new THREE.MeshStandardMaterial({ color: RED, roughness: .5 }));
  line.rotation.set(0, Math.PI / 2, Math.PI * .72); g.add(line);
  g.scale.setScalar(.82);
  return { obj: g, tilt: .2 };
}

const MAKERS = { driver: () => driver(), iron: () => iron(34), wedge: () => iron(56, true), putter: () => putter(), ball: () => ball() };

export function mount(el, kind, opts = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(renderer), .04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 5, 4); scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, .1, 100); cam.position.set(0, .9, 5.4); cam.lookAt(0, 0, 0);

  // soft contact shadow
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const cx = cv.getContext('2d'), gr = cx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.82; scene.add(shadow);

  const pivot = new THREE.Group(); scene.add(pivot);
  let cur = null, yaw = -.6, pitch = 0, vy = 0, drag = null, visible = false, raf = 0, pop = 1, scrollYaw = 0, last = performance.now(), idle = 0;

  function show(k) {
    if (cur) { pivot.remove(cur.obj); cur.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    cur = (MAKERS[k] || MAKERS.driver)(); pivot.add(cur.obj); pop = reduce ? 1 : 0; kick();
  }
  function size() {
    const r = el.getBoundingClientRect(); if (!r.width) return;
    renderer.setSize(r.width, r.height, false); cam.aspect = r.width / r.height;
    cam.position.z = r.width / r.height < .9 ? 6.6 : 5.4; cam.updateProjectionMatrix(); kick();
  }
  function frame(t) {
    raf = 0; const dt = Math.min(50, t - last) / 1000; last = t;
    if (!drag) { yaw += vy; vy *= .94; if (!reduce && Math.abs(vy) < .002) { idle += dt; if (idle > .6) yaw += dt * .45; } }
    if (pop < 1) pop = Math.min(1, pop + dt * 2.6);
    const e = 1 - Math.pow(1 - pop, 3), bounce = pop < 1 ? Math.sin(pop * Math.PI) * .08 : 0;
    pivot.rotation.set(pitch + (cur ? cur.tilt * .3 : 0), yaw + scrollYaw, 0);
    pivot.scale.setScalar(.6 + .4 * e + bounce);
    renderer.render(scene, cam);
    if (visible && (drag || !reduce || Math.abs(vy) > .001 || pop < 1)) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } else if (!visible) renderer.render(scene, cam); }

  const dom = renderer.domElement; dom.style.touchAction = 'pan-y';
  dom.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, t: performance.now() }; vy = 0; idle = 0; dom.setPointerCapture(e.pointerId); el.classList.add('grab'); kick(); });
  dom.addEventListener('pointermove', (e) => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    yaw += dx * .012; vy = dx * .012; pitch = Math.max(-.5, Math.min(.6, pitch + dy * .006)); el.classList.add('spun');
  });
  const up = () => { drag = null; idle = 0; el.classList.remove('grab'); };
  dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { vy = -.08; kick(); e.preventDefault(); } else if (e.key === 'ArrowRight') { vy = .08; kick(); e.preventDefault(); }
  });
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) kick(); }, { rootMargin: '100px' }).observe(el);
  addEventListener('resize', size);
  if (opts.scroll) addEventListener('scroll', () => {
    if (!visible) return; const r = el.getBoundingClientRect(); scrollYaw = (r.top + r.height / 2 - innerHeight / 2) / innerHeight * -2.2; kick();
  }, { passive: true });
  size(); show(kind);
  return { show, size };
}
