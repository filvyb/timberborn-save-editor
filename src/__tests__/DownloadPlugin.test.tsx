import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DownloadPlugin } from "../plugins/DownloadPlugin";
import { modernSave } from "./fixtures";
import { exportSave } from "../SaveFile";

vi.mock("../SaveFile", () => ({ exportSave: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("generates the archive once and revokes the download URL on close", async () => {
  const exportMock = vi.mocked(exportSave).mockResolvedValue(new Uint8Array([1, 2, 3]));
  const create = vi.fn(() => "blob:test-download");
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
  const { unmount } = render(<DownloadPlugin.Editor initialData={modernSave()} onClose={() => {}} onSubmit={() => {}} />);
  expect(await screen.findByRole("link", { name: "Download" })).toHaveAttribute("href", "blob:test-download");
  expect(exportMock).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledTimes(1);
  unmount();
  expect(revoke).toHaveBeenCalledWith("blob:test-download");
});

it("displays asynchronous export failures", async () => {
  vi.mocked(exportSave).mockRejectedValue(new Error("Export failed: invalid data"));
  render(<DownloadPlugin.Editor initialData={modernSave()} onClose={() => {}} onSubmit={() => {}} />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Export failed: invalid data"));
  expect(screen.queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
});
