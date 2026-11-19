// W13-C 등 일부 스크립트가 쓰는 세션 헬퍼(start(port, name) 형태, 이메일·비밀번호 로그인). 포트 인자는 호환을 위해 받지만 무시한다. 앱 소스를 수정하지 않는다.
import { writeFileSync } from 'node:fs'
import { launch } from './cdp.mjs'

export const q = (s) => JSON.stringify(s)

export async function start(port, name) {
  const t = await launch(`${name}-${Date.now()}`, port)
  const { ev, sleep, cdp } = t
  const out = t.out
  const h = {
    ...t,
    setVal: (sel, v) =>
      ev(
        `(()=>{const i=document.querySelector(${q(sel)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;i.focus();set.call(i,${q(v)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`,
      ),
    until: async (expr, n = 60) => {
      for (let i = 0; i < n; i++) {
        if (await ev(expr)) return true
        await sleep(100)
      }
      return false
    },
    press: async (k, code, vk) => {
      await cdp('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: k,
        code,
        windowsVirtualKeyCode: vk,
      })
      if (k === 'Enter')
        await cdp('Input.dispatchKeyEvent', {
          type: 'char',
          text: '\r',
          key: k,
          code,
          windowsVirtualKeyCode: vk,
        })
      if (k === ' ')
        await cdp('Input.dispatchKeyEvent', {
          type: 'char',
          text: ' ',
          key: k,
          code,
          windowsVirtualKeyCode: vk,
        })
      await cdp('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: k,
        code,
        windowsVirtualKeyCode: vk,
      })
      await sleep(120)
    },
    login: async (email, pw) => {
      await h.go('/login', 900)
      await h.until(`!!document.querySelector('input[type=email]')`, 120)
      await h.setVal('input[type=email]', email)
      await h.setVal('input[type=password]', pw)
      await ev(`document.querySelector('form').requestSubmit()`)
      await sleep(1400)
    },
    open: async (qs = '', path = '/records/exercise') => {
      await h.go(path + qs, 500)
      await h.until(`!!document.querySelector('main h1')`, 50)
      await sleep(300)
    },
    shot: async (file, full = true) => {
      const r = await cdp('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: full,
      })
      writeFileSync(`${out}/${file}`, Buffer.from(r.data, 'base64'))
    },
  }
  return h
}
