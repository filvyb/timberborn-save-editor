import { Component, type ReactNode } from "react";

export class EditorErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="container my-4"><div className="alert alert-danger" role="alert">
      <h2>This editor could not open the save data</h2>
      <p>{this.state.error}</p>
      <button className="btn btn-light" onClick={this.props.onClose}>Back to editors</button>
    </div></div>;
  }
}
