import { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:4000";

interface Feedback {
  id: string;
  type: "bug" | "feature";
  title: string;
  description: string;
  screenshot: string | null;
  user_id: string | null;
  created_at: string;
}

export function FeedbackView() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchFeedback();
  }, []);

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/api/feedback`, {
        withCredentials: true,
      });
      setFeedback(response.data.feedback || []);
    } catch (err) {
      console.error("Failed to fetch feedback:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div style={{ padding: 20 }}>
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#666" }}>Loading feedback...</div>
      ) : feedback.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
          No feedback submitted yet
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e5e7eb" }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ padding: 12, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#374151", width: 100 }}>Type</th>
              <th style={{ padding: 12, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#374151" }}>Title</th>
              <th style={{ padding: 12, textAlign: "left", fontSize: 12, fontWeight: 600, color: "#374151", width: 200 }}>Date</th>
              <th style={{ padding: 12, textAlign: "center", fontSize: 12, fontWeight: 600, color: "#374151", width: 80 }}>Screenshot</th>
            </tr>
          </thead>
          <tbody>
            {feedback.map((item) => (
              <>
                <tr
                  key={item.id}
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                    cursor: "pointer",
                    background: expandedId === item.id ? "#f9fafb" : "#fff",
                  }}
                >
                  <td style={{ padding: 12 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "4px 8px",
                        borderRadius: 4,
                        background: item.type === "bug" ? "#fee2e2" : "#dbeafe",
                        color: item.type === "bug" ? "#991b1b" : "#1e40af",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.type === "bug" ? "🐛 Bug" : "✨ Feature"}
                    </span>
                  </td>
                  <td style={{ padding: 12, fontSize: 14, fontWeight: 500 }}>{item.title}</td>
                  <td style={{ padding: 12, fontSize: 13, color: "#666" }}>{formatDate(item.created_at)}</td>
                  <td style={{ padding: 12, textAlign: "center", fontSize: 13 }}>
                    {item.screenshot ? "📎" : "—"}
                  </td>
                </tr>
                {expandedId === item.id && (
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td colSpan={4} style={{ padding: 20, background: "#fafafa" }}>
                      {item.description && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#374151" }}>
                            Description
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              color: "#333",
                              whiteSpace: "pre-wrap",
                              lineHeight: 1.6,
                            }}
                          >
                            {item.description}
                          </div>
                        </div>
                      )}
                      {item.screenshot && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#374151" }}>
                            Screenshot
                          </div>
                          <img
                            src={`${API_BASE}/api/feedback/${item.id}/screenshot`}
                            alt="Screenshot"
                            style={{
                              maxWidth: "100%",
                              border: "1px solid #e5e7eb",
                              borderRadius: 4,
                            }}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
