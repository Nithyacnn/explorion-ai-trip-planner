import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type Props = { name: string; children: ReactNode };
type State = { failed: boolean };

/** Keeps one broken dashboard card from blanking out the whole page. */
export class SectionBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(`[Explorion] section "${this.props.name}" failed to render:`, error);
  }

  override render() {
    if (this.state.failed) {
      return (
        <div className="card-ivory flex flex-wrap items-center gap-3 p-5 text-sm">
          <AlertTriangle className="size-4 shrink-0 opacity-70" />
          <span className="opacity-80">Couldn&apos;t load this part.</span>
          <button
            onClick={() => this.setState({ failed: false })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-current/25 px-3 py-1.5 text-xs font-semibold"
          >
            <RotateCcw className="size-3" /> Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
