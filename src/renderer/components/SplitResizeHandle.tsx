import { useCallback, useState, useRef } from 'react';

export default function SplitResizeHandle() {
  const [dragging, setDragging] = useState(false);
  const parentRef = useRef<HTMLDivElement | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);

    const handle = e.currentTarget;
    const parent = handle.parentElement!;
    parentRef.current = parent as HTMLDivElement;
    // Primary pane is the first child (the ReactFlowProvider wrapper's div)
    const primaryPane = parent.children[0] as HTMLElement;
    const startX = e.clientX;
    const startWidth = primaryPane.getBoundingClientRect().width;
    const parentWidth = parent.getBoundingClientRect().width;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const newWidth = Math.max(300, Math.min(parentWidth - 306, startWidth + dx)); // 300 min + 6 handle
      primaryPane.style.flex = 'none';
      primaryPane.style.width = `${newWidth}px`;
    };

    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 6,
        cursor: 'col-resize',
        backgroundColor: dragging ? '#a855f7' : 'transparent',
        transition: 'background-color 0.15s',
        flexShrink: 0,
        zIndex: 10,
        position: 'relative',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#2a2a3e'; }}
      onMouseLeave={(e) => { if (!dragging) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
    >
      {/* Visible grip dots */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        opacity: 0.4,
      }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{
            width: 2,
            height: 2,
            borderRadius: '50%',
            backgroundColor: '#a855f7',
          }} />
        ))}
      </div>
    </div>
  );
}
