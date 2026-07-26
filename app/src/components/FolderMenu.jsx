import { RotateCcw, Trash2, Download, Star, Info, UserPlus, Pencil, FolderInput, ChevronRight, Folder } from "lucide-react";
import { collectFolders, SHORTCUTS } from "./FileContextMenu";
import { MenuPanel, MenuRow } from "./Menu";
import { TRASH } from "../lib/theme";
import { useLayout } from "../contexts/LayoutContext";

// Right-click menu for a folder tile/row. Owned folders get the full set
// (download, details, share, rename, organize=star+move, trash); folders
// shared to the user get a reduced set; trashed folders get restore/delete.
export default function FolderMenu({ folderMenu, setFolderMenu }) {
  const {
    theme, fileTree,
    starredFolders, toggleStarFolder, folderCidsOf,
    folderOrganizeOpen, setFolderOrganizeOpen,
    downloadFolder, openDetails, setShareFile, promptRenameFolder,
    handleMoveFolder, handleTrashFolder, handleRestoreFolder, handleDeleteFolderForever,
    confirm,
  } = useLayout();
  const Row = MenuRow;
  const Hint = ({ text }) => <span style={{ color: theme.subText, fontSize: "12px" }}>{text}</span>;

  const starLabel = starredFolders?.has(folderMenu.path) ? "Remove from starred" : "Add to starred";
  const doStar = () => { setFolderMenu(null); toggleStarFolder(folderMenu.path); };

  const body = () => {
    if (folderMenu.trash) {
      return (
        <>
          <Row Icon={RotateCcw} label="Restore" onClick={() => { setFolderMenu(null); handleRestoreFolder(folderMenu.path); }} />
          <Row Icon={Trash2} label="Delete forever" color={TRASH} onClick={() => { setFolderMenu(null); handleDeleteFolderForever(folderMenu.path); }} />
        </>
      );
    }

    // Move destinations: all folders except the folder itself, its
    // descendants, and its current parent — plus root
    const parent = folderMenu.path.slice(0, folderMenu.path.lastIndexOf("/")) || "/";
    const dests = [
      ...(parent !== "/" ? [{ label: "/", path: "/" }] : []),
      ...collectFolders(fileTree).filter(({ path }) =>
        path !== folderMenu.path &&
        !path.startsWith(folderMenu.path + "/") &&
        path !== parent
      ),
    ];
    const doMove = async (destPath) => {
      setFolderMenu(null);
      if (!(await confirm({ title: "Move folder", message: `Move "${folderMenu.name}" to ${destPath}?`, confirmLabel: "Move" }))) return;
      handleMoveFolder(folderMenu.path, destPath);
    };

    return (
      <>
        <Row Icon={Download} label="Download" onClick={() => { setFolderMenu(null); downloadFolder(folderMenu.name, folderMenu.path); }} />
        {/* Shared folders have no move rights — star stays top-level */}
        {folderMenu.shared && <Row Icon={Star} label={starLabel} onClick={doStar} right={<Hint text={SHORTCUTS.star} />} />}
        <Row
          Icon={Info} label="Folder details"
          onClick={() => { setFolderMenu(null); openDetails({ type: "folder", name: folderMenu.name, path: folderMenu.path, shared: folderMenu.shared }); }}
        />
        {!folderMenu.shared && (
          <>
            <Row
              Icon={UserPlus} label="Share"
              onClick={() => {
                setFolderMenu(null);
                setShareFile({
                  folder: true,
                  filename: folderMenu.name,
                  path: folderMenu.path,
                  cids: folderCidsOf ? folderCidsOf(folderMenu.path) : [],
                });
              }}
            />
            <Row Icon={Pencil} label="Rename" onClick={() => { setFolderMenu(null); promptRenameFolder(folderMenu.name, folderMenu.path); }} right={<Hint text={SHORTCUTS.rename} />} />
            {/* Organize: star + move grouped like Drive */}
            <div
              style={{ position: "relative" }}
              onMouseEnter={() => setFolderOrganizeOpen(true)}
              onMouseLeave={() => setFolderOrganizeOpen(false)}
            >
              <Row Icon={FolderInput} label="Organize" onClick={() => {}} right={<ChevronRight size={14} color={theme.subText} />} />
              {folderOrganizeOpen && (
                <div style={{
                  position: "absolute", left: "100%", top: 0, minWidth: "200px",
                  maxHeight: "260px", overflowY: "auto",
                  backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "6px 0", zIndex: 10000,
                }}>
                  <Row Icon={Star} label={starLabel} onClick={doStar} right={<Hint text={SHORTCUTS.star} />} />
                  <div style={{ borderTop: `1px solid ${theme.border}`, margin: "4px 0" }} />
                  <div style={{ padding: "6px 18px 4px", fontSize: "12px", color: theme.subText }}>Move to</div>
                  {dests.length === 0 && (
                    <div style={{ padding: "8px 18px", fontSize: "13px", color: theme.subText }}>No other folders</div>
                  )}
                  {dests.map(({ label, path }) => (
                    <Row key={path} Icon={Folder} label={label} onClick={() => doMove(path)} />
                  ))}
                </div>
              )}
            </div>
            <Row Icon={Trash2} label="Move to trash" color={TRASH} onClick={() => { setFolderMenu(null); handleTrashFolder(folderMenu.path); }} right={<Hint text={SHORTCUTS.trash} />} />
          </>
        )}
      </>
    );
  };

  return (
    <MenuPanel x={folderMenu.x} y={folderMenu.y} width={180}>
      {body()}
    </MenuPanel>
  );
}
