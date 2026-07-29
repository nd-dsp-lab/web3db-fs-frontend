// The brand mark. Kept separate from the sidebar so the header, empty states,
// and any future sign-in screen show the same thing.
export default function Logo({ size = 32 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        backgroundColor: "#1A73E8", color: "white",
        width: `${size}px`, height: `${size}px`,
        borderRadius: `${size / 4}px`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: `${size * 0.44}px`, letterSpacing: "-0.02em",
      }}
    >
      W3
    </div>
  );
}
