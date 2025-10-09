import { useState, useRef } from "react";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:4000";

interface BugReportModalProps {
  onClose: () => void;
}

export function BugReportModal({ onClose }: BugReportModalProps) {
  const [reportType, setReportType] = useState<"bug" | "feature">("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScreenshot = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setScreenshot(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert("Please provide a title");
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("type", reportType);
      formData.append("title", title);
      formData.append("description", description);
      if (screenshot) {
        formData.append("screenshot", screenshot);
      }

      const response = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (response.ok) {
        alert("Thank you! Your feedback has been submitted.");
        onClose();
      } else {
        const data = await response.json();
        alert(`Failed to submit: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Submit feedback error:", err);
      alert("Failed to submit feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 24,
          width: "90%",
          maxWidth: 600,
          maxHeight: "90vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Report Bug / Request Feature</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 24,
              cursor: "pointer",
              color: "#666",
            }}
          >
            ×
          </button>
        </div>

        {/* Type Toggle */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151" }}>Type</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setReportType("bug")}
              style={{
                flex: 1,
                padding: "8px 16px",
                border: "1px solid #ddd",
                borderRadius: 4,
                background: reportType === "bug" ? "#fee2e2" : "#fff",
                color: reportType === "bug" ? "#991b1b" : "#666",
                fontWeight: reportType === "bug" ? 600 : 400,
                cursor: "pointer",
              }}
            >
              🐛 Bug Report
            </button>
            <button
              onClick={() => setReportType("feature")}
              style={{
                flex: 1,
                padding: "8px 16px",
                border: "1px solid #ddd",
                borderRadius: 4,
                background: reportType === "feature" ? "#dbeafe" : "#fff",
                color: reportType === "feature" ? "#1e40af" : "#666",
                fontWeight: reportType === "feature" ? 600 : 400,
                cursor: "pointer",
              }}
            >
              ✨ Feature Request
            </button>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151", display: "block" }}>
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={reportType === "bug" ? "Brief description of the bug" : "What feature would you like?"}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #ddd",
              borderRadius: 4,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151", display: "block" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              reportType === "bug"
                ? "Steps to reproduce:\n1. \n2. \n3. \n\nExpected behavior:\n\nActual behavior:"
                : "Describe the feature in detail..."
            }
            rows={8}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #ddd",
              borderRadius: 4,
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Screenshot */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151", display: "block" }}>
            Screenshot (optional)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={handleScreenshot}
              style={{
                padding: "8px 16px",
                border: "1px solid #ddd",
                borderRadius: 4,
                background: "#fff",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              📎 Attach Screenshot
            </button>
            {screenshot && (
              <span style={{ fontSize: 13, color: "#666" }}>
                {screenshot.name} ({(screenshot.size / 1024).toFixed(1)} KB)
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "8px 16px",
              border: "1px solid #ddd",
              borderRadius: 4,
              background: "#fff",
              cursor: submitting ? "not-allowed" : "pointer",
              fontSize: 14,
              opacity: submitting ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: 4,
              background: reportType === "bug" ? "#dc2626" : "#2563eb",
              color: "#fff",
              cursor: submitting || !title.trim() ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 600,
              opacity: submitting || !title.trim() ? 0.5 : 1,
            }}
          >
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
