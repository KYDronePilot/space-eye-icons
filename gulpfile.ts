const { exec } = require('child_process')
const { promisify } = require('util')
const { parallel, series } = require('gulp')
const fs = require('fs')
const path = require('path')

const asyncExec = promisify(exec)
const asyncCopyFile = promisify(fs.copyFile)

async function buildStandardToolbarIcon() {
    await asyncExec('inkscape -w 20 -h 20 src/toolbar.svg --export-filename dist/mac_toolbar.png')
}

async function buildRetinaToolbarIcon() {
    await asyncExec(
        'inkscape -w 40 -h 40 src/toolbar.svg --export-filename dist/mac_toolbar@2x.png'
    )
}

async function clean() {
    if (fs.existsSync('./dist')) {
        fs.rmdirSync('./dist', { recursive: true })
    }
    if (fs.existsSync('./build')) {
        fs.rmdirSync('./build', { recursive: true })
    }
    await Promise.all([asyncExec('mkdir ./dist'), asyncExec('mkdir ./build')])
    await asyncExec('mkdir ./dist/appx')
}

async function svgToPng(width: number, height: number, src: string, dest: string) {
    await asyncExec(`inkscape -w ${width} -h ${height} ${src} --export-filename ${dest}`)
}

async function svgToWindowsIco(src: string, dest: string) {
    const name = path.parse(dest).name
    const sizes = [16, 24, 32, 48, 64, 72, 96, 128, 180, 256]
    await Promise.all(sizes.map((size) => svgToPng(size, size, src, `build/${name}${size}.png`)))
    await asyncExec(`convert ${sizes.map((size) => `build/${name}${size}.png`).join(' ')} ${dest}`)
}

async function svgToMacIcns(src: string, dest: string) {
    const name = path.parse(dest).name
    const sizes = [16, 32, 64, 128, 256, 512, 1024]
    const sizeNames: { [key: number]: string[] } = {
        16: ['16x16'],
        32: ['16x16@2x', '32x32'],
        64: ['32x32@2x'],
        128: ['128x128'],
        256: ['128x128@2x', '256x256'],
        512: ['256x256@2x', '512x512'],
        1024: ['512x512@2x'],
    }
    const iconsetDir = `build/${name}.iconset`
    fs.mkdirSync(iconsetDir)
    await Promise.all(sizes.map((size) => svgToPng(size, size, src, `build/${name}${size}.png`)))
    await Promise.all(
        sizes.map(async (size) =>
            Promise.all(
                sizeNames[size].map(async (sizeName) =>
                    asyncCopyFile(
                        `build/${name}${size}.png`,
                        path.join(iconsetDir, `icon_${sizeName}.png`)
                    )
                )
            )
        )
    )
    await asyncExec(`iconutil -c icns ${iconsetDir} -o ${dest}`)
}

async function buildWindowToolbarIco() {
    await svgToWindowsIco('src/toolbar.svg', 'dist/windows_toolbar.ico')
}

async function buildWindowAppIco() {
    await svgToWindowsIco('src/app.svg', 'dist/windows_app.ico')
}

async function buildMacAppIcns() {
    await svgToMacIcns('src/app.svg', 'dist/mac_app.icns')
}

async function buildInfoIcon() {
    await asyncExec('inkscape -w 256 -h 256 src/app.svg --export-filename dist/info_app.png')
}

exports.build = series(
    clean,
    parallel(
        buildStandardToolbarIcon,
        buildRetinaToolbarIcon,
        buildWindowToolbarIco,
        buildWindowAppIco,
        buildMacAppIcns,
        buildInfoIcon
    )
)
