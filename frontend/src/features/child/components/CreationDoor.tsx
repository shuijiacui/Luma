export function CreationDoor({ opening, onOpen }: { opening: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`creation-door${opening ? ' is-open' : ''}`} onClick={onOpen} disabled={opening} aria-label={opening ? '正在打开创作大门' : '打开大门，去画画'}>
      <span className="door-shadow" aria-hidden="true" />
      <span className="door-frame" aria-hidden="true">
        <span className="door-world"><span className="door-world-sun" /><span className="door-world-hill hill-back" /><span className="door-world-hill hill-front" /><span className="door-easel"><span /></span><span className="door-world-star">✦</span></span>
        <span className="door-leaf">
          <span className="door-grain" />
          <span className="door-window"><span className="door-window-sun" /><i /><i /><i /></span>
          <span className="door-plaque"><svg viewBox="0 0 40 40" fill="none"><path d="m13 26 14-17 6 5-15 16-5-4Z" fill="#e1b966" stroke="#a17838" strokeWidth="1.2" /><path d="m13 26-4 9 9-5" fill="#fff3cf" stroke="#a17838" strokeWidth="1.2" /><path d="m9 35 2-5 3 3" fill="#517969" /></svg><strong>去画画</strong><small>什么都可以画</small></span>
          <span className="door-bottom-panel" /><span className="door-handle"><i /></span>
          <span className="door-hinge hinge-top" /><span className="door-hinge hinge-bottom" />
        </span>
      </span>
      <span className="door-step" aria-hidden="true" /><span className="door-mat" aria-hidden="true">HELLO, IMAGINATION</span>
    </button>
  )
}
