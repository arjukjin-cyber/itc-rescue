/**
 * "?" affordance — secondary guidance lives here (hover / focus / tap),
 * so each screen keeps at most one visible helper line.
 */
export function HelpTip({ text, label = "More info" }: { text: string; label?: string }) {
  return (
    <span className="help-q" tabIndex={0} role="button" aria-label={`${label}: ${text}`}>
      ?
      <span className="help-q-pop" role="tooltip" aria-hidden>
        {text}
      </span>
    </span>
  );
}
