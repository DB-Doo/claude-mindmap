import { useSessionStore } from '../store/session-store';

export default function ExpandNavButtons() {
  const navigateExpandedNode = useSessionStore((s) => s.navigateExpandedNode);

  return (
    <div className="expand-nav-buttons">
      <button
        className="expand-nav-btn"
        onClick={(e) => {
          e.stopPropagation();
          navigateExpandedNode('prev');
        }}
        title="Previous node (Up arrow)"
      >
        {'\u25B2'}
      </button>
      <button
        className="expand-nav-btn"
        onClick={(e) => {
          e.stopPropagation();
          navigateExpandedNode('next');
        }}
        title="Next node (Down arrow)"
      >
        {'\u25BC'}
      </button>
    </div>
  );
}
