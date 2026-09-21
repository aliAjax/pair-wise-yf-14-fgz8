import { useRef, useState } from "react";
import { useStore } from "../lighting/store";
import { formatTime } from "../lighting/labels";

/** 本地存档：演出/版本备注编辑、JSON 导出导入、恢复示例；变更自动写入 localStorage，刷新保留 */
export function Archive() {
  const { state, setShowName, setVersionNote, exportArchive, importArchive, resetAll } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const download = () => {
    const blob = new Blob([exportArchive()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lighting-cue-archive-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("已导出本地存档 JSON。");
  };

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const ok = importArchive(text);
    setMessage(ok ? "存档已导入并同步到全部视图。" : "导入失败：存档格式不正确。");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section className="panel archive-panel">
      <div className="heading">
        <div>
          <p>演出版本与本地存档</p>
          <h2>版本备注 / 备份恢复</h2>
        </div>
        <span className="persist-hint">最近自动保存：{formatTime(state.savedAt)}（刷新保留）</span>
      </div>

      <div className="archive-grid">
        <label>
          <span>演出名称</span>
          <input value={state.showName} onChange={(e) => setShowName(e.target.value)} />
        </label>
        <label className="archive-note">
          <span>演出版本备注</span>
          <input value={state.versionNote} onChange={(e) => setVersionNote(e.target.value)} />
        </label>
      </div>

      <div className="archive-actions">
        <button className="primary" onClick={download}>导出存档 JSON</button>
        <button onClick={() => fileRef.current?.click()}>导入存档</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImportFile(file);
          }}
        />
        <button
          className="danger ghost"
          onClick={() => {
            if (window.confirm("恢复为内置示例数据？当前本地存档将被覆盖。")) {
              resetAll();
              setMessage("已恢复示例数据。");
            }
          }}
        >
          恢复示例
        </button>
        {message && <span className="muted small">{message}</span>}
      </div>
    </section>
  );
}
