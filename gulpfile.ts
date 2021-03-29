import { exec } from 'child_process'
import { promisify } from 'util'
import { parallel, series } from 'gulp'
import fs from 'fs'
import fse from 'fs-extra'
import path from 'path'

const asyncExec = promisify(exec)
const asyncCopyFile = promisify(fs.copyFile)

const SRC = path.join(__dirname, 'src')
const BUILD = path.join(__dirname, 'build')
const DIST = path.join(__dirname, 'dist')

const APP_SVG = path.join(SRC, 'app.svg')
const TOOLBAR_SVG = path.join(SRC, 'toolbar.svg')
const APPX = path.join(DIST, 'appx')

/**
 * Clean build/dist dirs, preparing for new build.
 */
async function clean() {
    await Promise.all([fse.emptyDir(BUILD), fse.emptyDir(DIST)])
    await fse.ensureDir(APPX)
}

/**
 * Add padding to a PNG (in-place).
 *
 * @param paddingX - Padding in X dimension on each side
 * @param paddingY - Padding in Y dimension on each side
 * @param pngPath - Path to the PNG
 */
async function padPng(paddingX: number, paddingY: number, pngPath: string) {
    await asyncExec(
        `magick mogrify -bordercolor transparent -border ${paddingX}x${paddingY} -format png ${pngPath}`
    )
}

/**
 * Convert an SVG to a PNG.
 *
 * - Assumes SVGs are squares
 * - If dimensions are not square, padding is added for extra space
 *
 * @param width - Width of the PNG
 * @param height - Height of the PNG
 * @param svgPath - Path to the SVG
 * @param pngPath - Path to the PNG
 */
async function buildSvgToPng(
    width: number,
    height: number,
    svgPath: string,
    pngPath: string,
    preScalingFactor: number = 1,
    blurSigma: number | undefined = undefined,
    invert: boolean = false
) {
    // Build to PNG square of minDimension x minDimension
    const minDimension = Math.min(width, height)
    // Scale for initial dimensions (if using blurring)
    const preScaledDimensions = minDimension * preScalingFactor
    const initialDimensions = preScaledDimensions.toString()
    await asyncExec(
        `inkscape -w ${initialDimensions} -h ${initialDimensions} "${svgPath}" --export-filename "${pngPath}"`
    )
    // Invert color if necessary
    if (invert) {
        await asyncExec(`magick mogrify -channel RGB -negate ${pngPath}`)
    }
    if (blurSigma !== undefined) {
        // Blur the image
        await asyncExec(`magick mogrify -blur 0x${blurSigma.toFixed(1)} ${pngPath}`)
        // Resize down if scaling done
        if (minDimension !== preScaledDimensions) {
            await asyncExec(`magick mogrify -resize ${minDimension}x${minDimension} ${pngPath}`)
        }
    }
    // If not the same dimensions, add padding to take up the space
    if (width !== height) {
        await padPng(
            Math.round((width - minDimension) / 2),
            Math.round((height - minDimension) / 2),
            pngPath
        )
    }
}

/**
 * Build a PNG file with standard Mac icon padding.
 *
 * @param width - Width of the PNG
 * @param height - Height of the PNG
 * @param svgPath - Path to the SVG
 * @param pngPath - Path to the PNG
 */
async function buildPngWithMacIconPadding(
    width: number,
    height: number,
    svgPath: string,
    pngPath: string,
    preScalingFactor: number = 1,
    blurSigma: number | undefined = undefined
) {
    const totalPadding = Math.round((33 * height) / 256)
    const paddingAmount = totalPadding / 2
    await buildSvgToPng(
        width - totalPadding,
        height - totalPadding,
        svgPath,
        pngPath,
        preScalingFactor,
        blurSigma
    )
    await padPng(paddingAmount, paddingAmount, pngPath)
}

/**
 * Build toolbar icons for Mac.
 */
async function buildMacToolbarIcons() {
    await Promise.all([
        buildSvgToPng(20, 20, TOOLBAR_SVG, path.join(DIST, 'MacToolbarTemplate.png'), 16, 8),
        buildSvgToPng(40, 40, TOOLBAR_SVG, path.join(DIST, 'MacToolbarTemplate@2x.png'), 8, 6),
    ])
}

/**
 * Build a SVG to a Windows ICO file, with all appropriate sizes.
 *
 * @param svgPath - Path to SVG
 * @param icoPath - Path to ICO file
 */
async function buildSvgToWindowsIco(svgPath: string, icoPath: string, invert: boolean = false) {
    // Create a dir to save the initial PNG files in
    const name = path.parse(icoPath).name
    const buildAssets = path.join(BUILD, name)
    fse.ensureDir(buildAssets)
    const sizes: [number, number, number | undefined][] = [
        [16, 16, 6],
        [24, 16, 5],
        [32, 10, 4],
        [48, 8, 2],
        [64, 5, 2],
        [72, 1, undefined],
        [96, 1, undefined],
        [128, 1, undefined],
        [180, 1, undefined],
        [256, 1, undefined],
    ]
    // Build each size to a PNG
    await Promise.all(
        sizes.map(([size, initialScale, blurSigma]) =>
            buildSvgToPng(
                size,
                size,
                svgPath,
                path.join(buildAssets, `${size}.png`),
                initialScale,
                blurSigma,
                invert
            )
        )
    )
    // Convert to ICO
    await asyncExec(
        `convert ${sizes
            .map(([size, _, __]) => '"' + path.join(buildAssets, `${size}.png`) + '"')
            .join(' ')} "${icoPath}"`
    )
}

/**
 * Build a SVG to a Mac ICNS file, with appropriate sizes.
 *
 * @param svgPath - Path to SVG
 * @param icnsPath - Path to ICNS file
 */
async function svgToMacIcns(svgPath: string, icnsPath: string) {
    // Create a dir to save the initial PNG files in
    const name = path.parse(icnsPath).name
    const buildAssets = path.join(BUILD, name)
    fse.ensureDir(buildAssets)
    const sizes: [number, number, number | undefined][] = [
        [16, 16, 6],
        [32, 10, 4],
        [64, 5, 2],
        [128, 1, undefined],
        [256, 1, undefined],
        [512, 1, undefined],
        [1024, 1, undefined],
    ]
    // Names for each size
    const sizeNames: { [key: number]: string[] } = {
        16: ['16x16'],
        32: ['16x16@2x', '32x32'],
        64: ['32x32@2x'],
        128: ['128x128'],
        256: ['128x128@2x', '256x256'],
        512: ['256x256@2x', '512x512'],
        1024: ['512x512@2x'],
    }
    // Dir to save the renamed files to
    const iconsetDir = path.join(buildAssets, 'images.iconset')
    fse.ensureDir(iconsetDir)
    // Build initial PNGs
    await Promise.all(
        sizes.map(([size, initialScale, blurSigma]) =>
            buildPngWithMacIconPadding(
                size,
                size,
                svgPath,
                path.join(buildAssets, `${size}.png`),
                initialScale,
                blurSigma
            )
        )
    )
    // Copy to proper file names
    await Promise.all(
        sizes.map(async ([size, _, __]) =>
            Promise.all(
                sizeNames[size].map(async (sizeName) =>
                    asyncCopyFile(
                        path.join(buildAssets, `${size}.png`),
                        path.join(iconsetDir, `icon_${sizeName}.png`)
                    )
                )
            )
        )
    )
    // Finally, build to an icns file
    await asyncExec(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`)
}

/**
 * Build toolbar ICO for Windows.
 */
async function buildWindowsToolbarIco() {
    await buildSvgToWindowsIco(TOOLBAR_SVG, path.join(DIST, 'windows_toolbar.ico'))
}

/**
 * Build light toolbar ICO for Windows.
 */
async function buildWindowsLightToolbarIco() {
    await buildSvgToWindowsIco(TOOLBAR_SVG, path.join(DIST, 'windows_toolbar_light.ico'), true)
}

/**
 * Build app ICO for Windows.
 */
async function buildWindowsAppIco() {
    await buildSvgToWindowsIco(APP_SVG, path.join(DIST, 'windows_app.ico'))
}

/**
 * Build app ICNS for Mac.
 */
async function buildMacAppIcns() {
    await svgToMacIcns(APP_SVG, path.join(DIST, 'mac_app.icns'))
}

/**
 * Build info icon (for "About This App" page).
 */
async function buildInfoIcon() {
    await buildSvgToPng(256, 256, APP_SVG, path.join(DIST, 'info_app.png'))
}

/**
 * Build app icons for APPX (Microsoft Store) builds.
 */
async function buildUwpIcons() {
    return Promise.all([
        buildSvgToPng(512, 512, APP_SVG, path.join(APPX, 'BadgeLogo.png')),
        buildSvgToPng(310, 310, APP_SVG, path.join(APPX, 'LargeTile.png')),
        buildSvgToPng(71, 71, APP_SVG, path.join(APPX, 'SmallTile.png'), 4, 2),
        buildSvgToPng(44, 44, APP_SVG, path.join(APPX, 'Square44x44Logo.png'), 8, 4),
        buildSvgToPng(150, 150, APP_SVG, path.join(APPX, 'Square150x150Logo.png')),
        buildSvgToPng(64, 64, APP_SVG, path.join(APPX, 'StoreLogo.png'), 4, 2),
        buildSvgToPng(310, 150, APP_SVG, path.join(APPX, 'Wide310x150Logo.png')),
    ])
}

export const build = series(
    clean,
    parallel(
        buildMacToolbarIcons,
        buildWindowsToolbarIco,
        buildWindowsLightToolbarIco,
        buildWindowsAppIco,
        buildMacAppIcns,
        buildInfoIcon,
        buildUwpIcons
    )
)
