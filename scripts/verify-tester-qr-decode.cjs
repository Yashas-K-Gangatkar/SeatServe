// Decode tester QR PNGs with jsqr (same lib as the /scan page) and verify
// they encode the exact prod URLs from the manifest.
const jsQR = require('jsqr')
const { createCanvas, loadImage } = require('canvas')
const fs = require('fs')
const path = require('path')

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'tester-hall-manifest.json'), 'utf8'))
const seats = process.argv.slice(2).length ? process.argv.slice(2) : ['B-1', 'A-1', 'J-10']

;(async () => {
  for (const seat of seats) {
    const file = path.join(__dirname, '..', 'download', 'tester-qr', 'qr', `${seat}.png`)
    const img = await loadImage(file)
    const canvas = createCanvas(img.width, img.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, img.width, img.height)
    const res = jsQR(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' })
    const expected = `https://ctshop-five.vercel.app/?qr=${manifest[seat]}`
    const ok = res && res.data === expected
    console.log(`${ok ? '✅' : '❌'} ${seat}: decoded="${res ? res.data : 'NONE'}" ${ok ? '== expected' : `!= expected="${expected}"`}`)
    if (!ok) process.exitCode = 1
  }
})()
