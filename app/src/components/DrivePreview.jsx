import { HardDrive, Users, Clock, Star, Trash2, Folder, FileText, Lock } from "lucide-react";
import { BLUE } from "../lib/theme";

// A scaled-down still of the drive itself, for the landing page. Signed-out
// visitors otherwise never see what they are signing in to.
//
// It is drawn from the same theme tokens as the real chrome rather than being
// a screenshot, so it follows the light/dark toggle and cannot rot into a
// picture of a version that no longer exists.
const NAV = [
  { Icon: HardDrive, label: "My Drive", active: true },
  { Icon: Users, label: "Shared with me" },
  { Icon: Clock, label: "Recent" },
  { Icon: Star, label: "Starred" },
  { Icon: Trash2, label: "Trash" },
];

const FOLDERS = ["CoReMe2026", "Datasets"];
const FILES = ["paper-draft.pdf", "results.csv", "figure-3.png"];

const ellipsis = { overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };

const tileStyle = (theme) => ({
  backgroundColor: theme.tile, borderRadius: "10px", color: theme.text,
  display: "flex", alignItems: "center", gap: "8px", minWidth: 0,
});

const Section = ({ label, theme, top = 0 }) => (
  <div style={{ color: theme.subText, margin: `${top}px 0 8px`, fontWeight: 500 }}>{label}</div>
);

export default function DrivePreview({ theme }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex", width: "100%", maxWidth: "1000px",
        backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
        borderRadius: "16px", overflow: "hidden", textAlign: "left",
        boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
        fontSize: "11px", userSelect: "none",
      }}
    >
      <div style={{ width: "150px", padding: "16px 10px", flexShrink: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px",
          borderRadius: "999px", backgroundColor: theme.card, color: theme.text,
          marginBottom: "14px", boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
        }}>
          <span style={{ color: BLUE, fontSize: "14px", lineHeight: 1 }}>+</span> New
        </div>
        {NAV.map(({ Icon, label, active }) => (
          <div
            key={label}
            style={{
              display: "flex", alignItems: "center", gap: "9px",
              padding: "6px 12px", borderRadius: "999px", marginBottom: "2px",
              backgroundColor: active ? theme.navActive : "transparent",
              color: active ? theme.navActiveText : theme.subText,
              fontWeight: active ? 600 : 400,
            }}
          >
            <Icon size={13} strokeWidth={1.8} /> {label}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 12px 8px 0" }}>
          <div style={{
            flex: 1, backgroundColor: theme.searchBg, borderRadius: "999px",
            padding: "7px 14px", color: theme.subText,
          }}>
            Search in Web3FS
          </div>
          <div style={{
            width: "20px", height: "20px", borderRadius: "50%", backgroundColor: BLUE,
            color: "white", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "10px", fontWeight: 600, flexShrink: 0,
          }}>0</div>
        </div>

        <div style={{
          flex: 1, margin: "0 10px 10px 0", padding: "16px 18px 20px",
          backgroundColor: theme.card, borderRadius: "12px",
        }}>
          <div style={{ fontSize: "15px", color: theme.text, marginBottom: "14px" }}>My Drive</div>

          <Section label="Folders" theme={theme} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
            {FOLDERS.map((name) => (
              <div key={name} style={{ ...tileStyle(theme), padding: "9px 12px" }}>
                <Folder size={14} fill={theme.subText} strokeWidth={0} style={{ flexShrink: 0 }} />
                <span style={ellipsis}>{name}</span>
              </div>
            ))}
          </div>

          <Section label="Files" theme={theme} top={16} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
            {FILES.map((name) => (
              <div key={name} style={{ ...tileStyle(theme), flexDirection: "column", alignItems: "stretch", gap: "8px", padding: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <FileText size={13} color={theme.subText} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                  <span style={{ ...ellipsis, flex: 1 }}>{name}</span>
                  {/* Every file carries it, because every file is encrypted —
                      marking one would imply the others are not. */}
                  <Lock size={11} color={BLUE} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                </div>
                {/* stands in for the thumbnail the real grid renders */}
                <div style={{ height: "46px", borderRadius: "6px", backgroundColor: theme.bg }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
