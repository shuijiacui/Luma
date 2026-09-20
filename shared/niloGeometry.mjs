// Shared geometry ensures the review and final drawing use the same paths.
import { compileSketch } from './niloSketch.mjs'
const path = (...xy) => Array.from({ length: xy.length / 2 }, (_, i) => ({ x: xy[i * 2], y: xy[i * 2 + 1] }));
const ellipse = (cx, cy, rx, ry, start = 0, end = Math.PI * 2) => Array.from({ length: 49 }, (_, i) => ({ x: cx + Math.cos(start + (end - start) * i / 48) * rx, y: cy + Math.sin(start + (end - start) * i / 48) * ry }));
const curve = (x0, y0, x1, y1, x2, y2) => Array.from({ length: 33 }, (_, i) => { const t = i / 32; return { x: (1 - t) ** 2 * x0 + 2 * t * (1 - t) * x1 + t ** 2 * x2, y: (1 - t) ** 2 * y0 + 2 * t * (1 - t) * y1 + t ** 2 * y2 }; });
/** Small complete contributions. Geometry, preview and committed drawing share these paths. */
export function localPaths(template) {
    switch (template) {
        case 'waves': return [0.28, 0.7].map(y => Array.from({ length: 61 }, (_, i) => ({ x: 0.06 + i / 60 * .88, y: y + Math.sin(i / 60 * Math.PI * 4) * .13 })));
        case 'fish': return [ellipse(.43, .5, .34, .29), path(.75, .5, .94, .18, .94, .82, .75, .5), ellipse(.25, .43, .025, .035)];
        case 'leaf': return [curve(.1, .9, .04, .06, .9, .1), curve(.9, .1, .96, .94, .1, .9), path(.1, .9, .9, .1), path(.43, .57, .23, .35), path(.61, .39, .77, .65)];
        case 'window': return [path(.12, .12, .88, .12, .88, .88, .12, .88, .12, .12), path(.5, .12, .5, .88), path(.12, .5, .88, .5)];
        case 'stars': return [[.3, .35, .24], [.77, .74, .15]].map(([cx, cy, r]) => Array.from({ length: 11 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5; return { x: cx + Math.cos(a) * r * (i % 2 ? .42 : 1), y: cy + Math.sin(a) * r * (i % 2 ? .42 : 1) }; }));
        case 'cloud': return [curve(.1, .72, -.04, .3, .28, .35).concat(curve(.28, .35, .43, -.12, .66, .35), curve(.66, .35, 1.06, .18, .9, .72), path(.9, .72, .1, .72))];
        case 'flower': return [path(.5, .5, .5, .94), curve(.5, .78, .05, .5, .16, .85), ...Array.from({ length: 5 }, (_, i) => { const a = i * Math.PI * 2 / 5; return ellipse(.5 + Math.cos(a) * .19, .35 + Math.sin(a) * .19, .12, .12); }), ellipse(.5, .35, .09, .09)];
        case 'trail': return [curve(.15, .92, .85, .55, .46, .08), curve(.44, .92, 1, .57, .64, .08)];
        case 'flame': return [curve(.12, .12, -.08, .54, .5, .94).concat(curve(.5, .94, 1.08, .54, .88, .12)), curve(.36, .16, .28, .55, .5, .73).concat(curve(.5, .73, .72, .55, .64, .16))];
        case 'rain': return [.2, .5, .8].flatMap(x => [path(x, .08, x - .12, .4), path(x + .08, .6, x - .04, .92)]);
        case 'grass': return [.22, .5, .78].flatMap(x => [curve(x, .9, x - .03, .24, x - .13, .12), curve(x, .9, x + .01, .45, x + .13, .3)]);
        case 'sun': return [ellipse(.5, .5, .23, .23), ...Array.from({ length: 8 }, (_, i) => {
                const a = i * Math.PI / 4;
                return path(.5 + Math.cos(a) * .32, .5 + Math.sin(a) * .32, .5 + Math.cos(a) * .44, .5 + Math.sin(a) * .44);
            })];
        case 'moon': return [curve(.7, .09, -.31, .5, .7, .91).concat(curve(.7, .91, .18, .5, .7, .09))];
        case 'tree': return [path(.43, .91, .43, .59), path(.57, .91, .57, .59), path(.37, .92, .65, .92),
            curve(.28, .64, .02, .3, .3, .32).concat(curve(.3, .32, .5, -.14, .7, .32), curve(.7, .32, .98, .3, .72, .64), curve(.72, .64, .5, .74, .28, .64)),
            path(.5, .66, .5, .48, .4, .4), path(.5, .55, .64, .43)];
        case 'mountain': return [path(.05, .91, .37, .12, .7, .91), path(.56, .57, .75, .26, .95, .91),
            path(.28, .35, .34, .4, .4, .32, .47, .36), path(.68, .38, .75, .45, .8, .38), path(.06, .92, .94, .92)];
        case 'house': return [path(.08, .45, .5, .08, .92, .45), path(.18, .4, .18, .9, .82, .9, .82, .4),
            path(.42, .9, .42, .64, .59, .64, .59, .9), path(.27, .51, .38, .51, .38, .63, .27, .63, .27, .51),
            path(.66, .22, .66, .1, .77, .1, .77, .32)];
        case 'boat': return [path(.1, .65, .9, .65, .78, .88, .24, .88, .1, .65), path(.48, .64, .48, .09),
            path(.43, .15, .15, .57, .43, .57, .43, .15), path(.54, .23, .82, .57, .54, .57, .54, .23)];
        case 'bird': return [ellipse(.5, .59, .23, .18), path(.72, .53, .89, .58, .72, .63),
            path(.28, .53, .1, .4, .17, .66, .29, .67), curve(.36, .55, .58, .76, .66, .46),
            ellipse(.62, .54, .018, .022), path(.45, .77, .42, .9, .34, .9), path(.57, .77, .56, .9, .64, .9)];
        case 'butterfly': return [ellipse(.3, .34, .19, .24), ellipse(.7, .34, .19, .24), ellipse(.32, .71, .15, .18), ellipse(.68, .71, .15, .18),
            path(.5, .24, .5, .87), curve(.5, .27, .31, .05, .34, .08), curve(.5, .27, .69, .05, .66, .08)];
        case 'heart': return [Array.from({ length: 65 }, (_, i) => {
                const a = i / 64 * Math.PI * 2;
                return { x: .5 + Math.sin(a) ** 3 * .4, y: .47 - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * .026 };
            })];
        case 'echo': return []; // Echo paths must come from the child's actual stroke, never a generic curve.
    }
}
export function sampleProposalGeometry(p, aspect = 1) {
    if (!Number.isFinite(aspect) || aspect <= 0)
        return [];
    const angle = p.rotation * Math.PI / 180;
    let paths = p.template === 'custom' ? compileSketch(p.sketch) : localPaths(p.template);
    if (p.template === 'echo' && p.echoPoints) {
        const xs = p.echoPoints.map(point => point.x * aspect), ys = p.echoPoints.map(point => point.y);
        const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
        const scale = Math.min(right > left ? .84 * p.width * aspect / (right - left) : Infinity, bottom > top ? .84 * p.height / (bottom - top) : Infinity);
        paths = [p.echoPoints.map(point => ({ x: .5 + (point.x * aspect - (left + right) / 2) * scale / (p.width * aspect), y: .5 + (point.y - (top + bottom) / 2) * scale / p.height }))];
    }
    // Rotate in physical canvas space, not stretched normalised coordinates.
    return paths.map(points => ({
        kind: p.template, color: p.color, width: p.strokeWidth, brushKind: p.brushKind ?? 'round',
        points: points.map(point => {
            const dx = (point.x - .5) * p.width, dy = (point.y - .5) * p.height;
            return { x: p.x + p.width / 2 + Math.cos(angle) * dx - Math.sin(angle) * dy / aspect,
                y: p.y + p.height / 2 + Math.sin(angle) * dx * aspect + Math.cos(angle) * dy };
        }),
    }));
}
const naturalRatios = {
    waves: 2.8, fish: 1.55, leaf: .8, window: 1, stars: 1, cloud: 1.7,
    flower: .7, trail: .8, flame: .65, rain: 1.25, grass: 2.2,
    sun: 1, moon: .85, tree: .8, mountain: 1.55, house: 1, boat: 1.4,
    bird: 1.4, butterfly: 1.1, heart: 1,
};
export function proportionedProposal(p, aspect) {
    let width = p.width * aspect;
    let height = p.height;
    if (p.template !== 'echo') {
        const ratio = p.template === 'custom' ? p.sketch.aspect : naturalRatios[p.template];
        if (width / height > ratio)
            width = height * ratio;
        else
            height = width / ratio;
    }
    if (p.anchor) {
        const aw = p.anchor.width * aspect, ah = p.anchor.height;
        const subjectSize = Math.max(aw, ah);
        let maxWidth = subjectSize * .85, maxHeight = subjectSize * .85;
        if (p.placement === 'inside' || p.template === 'window') {
            const fraction = p.template === 'window' ? .6 : .8;
            maxWidth = aw * fraction;
            maxHeight = ah * fraction;
        }
        else if (p.template === 'waves' || p.template === 'grass') {
            maxWidth = aw * 1.15;
            maxHeight = ah * .5;
        }
        const scale = Math.min(1, maxWidth / width, maxHeight / height);
        width *= scale;
        height *= scale;
    }
    return { ...p, x: p.x + (p.width - width / aspect) / 2, y: p.y + (p.height - height) / 2, width: width / aspect, height };
}
