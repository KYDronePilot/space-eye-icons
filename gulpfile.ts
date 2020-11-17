const { exec } = require('child_process')
const { promisify } = require('util')
const { parallel, series } = require('gulp')
const fs = require('fs')
const path = require('path')

const asyncExec = promisify(exec)
const asyncCopyFile = promisify(fs.copyFile)

const SRC = path.join(__dirname, 'src')
const APP_SVG = path.join(SRC, 'app.svg')
const TOOLBAR_SVG = path.join(SRC, 'toolbar.svg')
const DIST = path.join(__dirname, 'dist')
const APPX = path.join(DIST, 'appx')

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

async function buildSvgToPng(width: number, height: number, svgPath: string, outputPath: string) {
    await asyncExec(`inkscape -w ${width} -h ${height} ${svgPath} --export-filename ${outputPath}`)
}

/**
 * Add padding to a PNG.
 * @param paddingX
 * @param paddingY
 */
async function padPng(paddingX: number, paddingY: number, filePath: string) {
    await asyncExec(
        `magick mogrify -bordercolor transparent -border ${paddingX}x${paddingY} -format png ${filePath}`
    )
}

async function buildSvg(
    width: number,
    height: number,
    name: string,
    svgPath: string,
    outputPath: string
): Promise<string> {
    const filePath = path.join(outputPath, `${name}.png`)
    const minDimension = Math.min(width, height)
    await buildSvgToPng(minDimension, minDimension, svgPath, filePath)
    if (width !== height) {
        await padPng((width - minDimension) / 2, (height - minDimension) / 2, filePath)
    }
    return filePath
}

async function buildSvgWithPadding(
    width: number,
    height: number,
    name: string,
    svgPath: string,
    outputPath: string,
    paddingX: number = 0,
    paddingY: number = 0
): Promise<string> {
    const filePath = await buildSvg(width, height, name, svgPath, outputPath)
    if (paddingX !== 0 || paddingY !== 0) {
        await padPng(paddingX, paddingY, filePath)
    }
    return filePath
}

const scales = [1, 2, 4]

async function buildScaledUwpIcons(
    width: number,
    height: number,
    name: string,
    svgPath: string,
    outputPath: string,
    paddingX: number = 0,
    paddingY: number = 0
) {
    await Promise.all(
        scales.map((scale) =>
            buildSvgWithPadding(
                width * scale,
                height * scale,
                `${name}.scale-${scale * 100}`,
                svgPath,
                outputPath,
                paddingX * scale,
                paddingY * scale
            )
        )
    )
}

async function buildUwpIcons() {
    return Promise.all([
        buildScaledUwpIcons(44, 44, 'Square44x44Logo', APP_SVG, APPX),
        buildSvgWithPadding(50, 50, 'StoreLogo', APP_SVG, APPX),
        buildScaledUwpIcons(50, 50, 'StoreLogo', APP_SVG, APPX),
        buildScaledUwpIcons(71, 71, 'SmallTile', APP_SVG, APPX),
        buildScaledUwpIcons(150, 150, 'MedTile', APP_SVG, APPX),
        buildScaledUwpIcons(150, 150, 'Square150x150Logo', APP_SVG, APPX),
        buildScaledUwpIcons(310, 150, 'Wide310x150Logo', APP_SVG, APPX),
        buildScaledUwpIcons(310, 310, 'LargeTile', APP_SVG, APPX),
        buildScaledUwpIcons(620, 300, 'SplashScreen', APP_SVG, APPX),
    ])
}

exports.build = series(
    clean,
    parallel(
        buildStandardToolbarIcon,
        buildRetinaToolbarIcon,
        buildWindowToolbarIco,
        buildWindowAppIco,
        buildMacAppIcns,
        buildInfoIcon,
        buildUwpIcons
    )
)
