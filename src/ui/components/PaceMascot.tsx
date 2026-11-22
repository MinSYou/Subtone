import type { PaceStatus } from '../../analytics';
import { PACE_LABEL } from '../../analytics';

/**
 * "Penny", the budget-pace buddy: an original coin character whose colour, expression and motion
 * carry the pace status at a glance, so Home needs fewer words.
 *
 *  under    teal, big grin, sparkles, gentle float
 *  on-pace  green, calm smile, slow breathing
 *  fast     amber, worried brows, wobbly mouth, sweat drop, jittery
 *  over     coral, frown, flushed cheeks, steam, shakes
 *  no-budget grey, sleepy eyes
 *
 * Expressions cross-fade (opacity) rather than morphing paths, so it works in Safari too.
 * All motion stops under prefers-reduced-motion; colour and face still convey the state.
 */
const TONE: Record<PaceStatus, { body: string; rim: string; cheek: string }> = {
  under: { body: '#3BB7A5', rim: '#23887A', cheek: '#9BE3D8' },
  'on-pace': { body: '#4CAF6E', rim: '#327F4D', cheek: '#A9E2BC' },
  fast: { body: '#F2A33A', rim: '#C27A1C', cheek: '#FFD49A' },
  over: { body: '#E4643E', rim: '#B2432A', cheek: '#FF9C86' },
  'no-budget': { body: '#B7BAC2', rim: '#8D919B', cheek: '#DADCE1' },
};

export function PaceMascot({ status, size = 72 }: { status: PaceStatus; size?: number }) {
  const t = TONE[status];
  const on = (...s: PaceStatus[]) => (s.includes(status) ? 1 : 0);
  return (
    <svg
      className={`mascot mascot-${status}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Budget pace: ${PACE_LABEL[status]}`}
    >
      <ellipse className="m-shadow" cx="50" cy="94" rx="24" ry="3.5" fill="#17181C" opacity=".12" />
      <g className="m-body">
        <circle cx="50" cy="50" r="38" style={{ fill: t.rim }} />
        <circle cx="50" cy="47" r="35" style={{ fill: t.body }} />
        <path d="M27 34a28 28 0 0 1 20-14" stroke="#fff" strokeOpacity=".45" strokeWidth="5" strokeLinecap="round" fill="none" />

        {/* cheeks */}
        <ellipse cx="30" cy="58" rx="6" ry="4" style={{ fill: t.cheek, opacity: on('under', 'on-pace', 'over') }} />
        <ellipse cx="70" cy="58" rx="6" ry="4" style={{ fill: t.cheek, opacity: on('under', 'on-pace', 'over') }} />

        {/* eyes: open (blink animation) or sleepy */}
        <g className="m-eyes" style={{ opacity: 1 - on('no-budget') }}>
          <ellipse cx="38" cy="45" rx="4.2" ry="5.4" fill="#17181C" />
          <ellipse cx="62" cy="45" rx="4.2" ry="5.4" fill="#17181C" />
          <circle cx="39.6" cy="43" r="1.4" fill="#fff" />
          <circle cx="63.6" cy="43" r="1.4" fill="#fff" />
        </g>
        <g style={{ opacity: on('no-budget') }} stroke="#17181C" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M33 46h9M58 46h9" />
        </g>

        {/* brows: worried (fast) / cross (over) */}
        <g stroke="#17181C" strokeWidth="2.6" strokeLinecap="round" fill="none">
          {/* worried: inner ends raised */}
          <path d="M32 37l9-3M68 37l-9-3" style={{ opacity: on('fast') }} />
          {/* cross: inner ends lowered */}
          <path d="M32 34l9 4M68 34l-9 4" style={{ opacity: on('over') }} />
        </g>

        {/* mouths */}
        <g stroke="#17181C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M37 59q13 14 26 0z" fill="#17181C" style={{ opacity: on('under') }} />
          <path d="M39 60q11 9 22 0" fill="none" style={{ opacity: on('on-pace') }} />
          <path d="M38 63q4-4 8 0t8 0t8 0" fill="none" style={{ opacity: on('fast') }} />
          <path d="M39 67q11-10 22 0" fill="none" style={{ opacity: on('over') }} />
          <path d="M42 62h16" fill="none" style={{ opacity: on('no-budget') }} />
        </g>
      </g>

      {/* extras */}
      {/* Visibility lives on the outer group; the animation runs on the inner one, because a CSS
          animation that touches opacity would override the inline opacity and show sparkles always. */}
      <g style={{ opacity: on('under') }}>
        <g className="m-sparkles" fill="#FFD23F">
          <path d="M86 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
          <path d="M12 30l1.4 3.4 3.4 1.4-3.4 1.4L12 39.6l-1.4-3.4L7.2 34.8l3.4-1.4z" />
        </g>
      </g>
      <path className="m-sweat" d="M84 30c3 5 4 8 4 10a4 4 0 0 1-8 0c0-2 1-5 4-10z" fill="#6EC1F5" style={{ opacity: on('fast') }} />
      <g style={{ opacity: on('over') }}>
        <g className="m-steam" fill="none" stroke="#9AA0AA" strokeWidth="3" strokeLinecap="round">
          <path d="M30 10q-4 4 0 8t0 8" />
          <path d="M70 10q-4 4 0 8t0 8" />
        </g>
      </g>
    </svg>
  );
}
