import { getDrawingIllustration } from '../../../shared/niloIllustrations.mjs'

/** Reviewed physical affordances of specific drawings, not subject-level guesses.
 * Coordinates are normalized in the original artwork before aspect fitting.
 * Unknown materials retain the existing top-contour behavior; an explicit false
 * prevents a known misleading contour from being used as a support surface.
 */
const geometry = Object.freeze({
  // Captions audited against the original PNGs, not a generated scene or a
  // model's inference from the filename. State visible geometry explicitly.
  'illustration-library-boat-beginner-01': Object.freeze({ actualPose: '两端尖翘的船身，中央三角形轮廓和竖直分割线，下方有水纹；不以折纸材质作为可见承诺' }),
  'illustration-library-boat-medium-01': Object.freeze({ actualPose: '板条船身、直立桅杆和一面大三角帆，船内有横座，尾部有船舵' }),
  'illustration-library-moonboat-beginner-01': Object.freeze({ actualPose: '带闭眼笑脸的弯月形船身，月牙凹弧内有直立桅杆和三角帆，下方有水纹' }),
  'illustration-library-moonboat-medium-01': Object.freeze({ actualPose: '两端高翘的板条船身，直立桅杆和一面大帆；星形图案在船身，船头垂挂一颗星星，帆上没有星形图案' }),
  'illustration-library-sleepycloud-beginner-01': Object.freeze({ actualPose: '圆弧边缘的完整云朵，有闭眼睫毛和微笑表情，没有月亮' }),
  'illustration-library-sleepycloud-medium-01': Object.freeze({ actualPose: '闭眼微笑的完整云朵，两只手臂抱着一弯同样闭眼微笑的月牙' }),
  'illustration-library-whale-beginner-01': Object.freeze({ supportsOn: false,
    supportReason: 'The highest contour is a water spout attached across the back. Placing a building on that contour makes it float above the whale, while lowering it intersects the spout.' }),
  'illustration-library-whale-medium-01': Object.freeze({ supportsOn: false,
    supportReason: 'This whale is breaching diagonally. Its highest contour is its snout, not a horizontal back suitable for buildings.' }),
  'whale-0': Object.freeze({ supportsOn: false, supportReason: 'Two water-spout strokes occupy the upper back; the overall top contour is not a usable support.' }),
  'whale-2': Object.freeze({ supportsOn: false, supportReason: 'This front-facing whale has a spout above its head, not a visible free back.' }),
  // Verified from the original body Bezier of the swimming, non-spouting pose.
  // This intentionally narrow, nearly horizontal segment excludes tail/waves.
  'whale-1': Object.freeze({ supportsOn: true, supportSurface: Object.freeze({ left: .24, right: .40, y: .25 }) }),
})

const completeSceneGeometry = Object.freeze({ supportsOn: false,
  supportReason: 'This is an indivisible complete scene. Its outer image boundary is not a physical support surface; internal objects cannot be cut out or used as editable anchors.' })
export const getMaterialGeometry = id => geometry[id] ?? (getDrawingIllustration(id)?.completeScene ? completeSceneGeometry : undefined)
