import worldArtwork from '@/assets/images/nilo-storybook-world-v2.png'

export function CreationDoor({ opening, onOpen }: { opening: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`creation-door${opening ? ' is-open' : ''}`} onClick={onOpen} disabled={opening} aria-label={opening ? '正在打开创作大门' : '打开大门，去画画'}>
      <span className="door-world" aria-hidden="true"><span className="door-world-sun" /><span className="door-world-hill" /><span className="door-easel"><span /></span><span className="door-world-star">✦</span></span>
      <span className="door-leaf" aria-hidden="true">
        <img className="door-painted-surface" src={worldArtwork} alt="" draggable={false} />
        <span className="door-plaque-lettering"><svg viewBox="0 0 40 40" fill="none"><path d="m13 26 14-17 6 5-15 16-5-4Z" fill="#d3a550" stroke="#8d713e" strokeWidth="1.2" /><path d="m13 26-4 9 9-5" fill="#fff3cf" stroke="#8d713e" strokeWidth="1.2" /><path d="m9 35 2-5 3 3" fill="#517969" /></svg><strong>去画画</strong></span>
      </span>
      <span className="door-light-seam" aria-hidden="true" />
      <span className="door-click-spark" aria-hidden="true">✦</span>
    </button>
  )
}
