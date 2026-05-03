interface UpdateDialogProps {
  versionName: string
  releaseNotes: string
  isForceUpdate: boolean
  onUpdate: () => void
  onSkip: () => void
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({ versionName, releaseNotes, isForceUpdate, onUpdate, onSkip }) => {
  return (
    <div className="update-overlay">
      <div className="update-dialog section-card">
        <h3>发现新版本 v{versionName}</h3>
        {releaseNotes && <p className="update-notes">{releaseNotes}</p>}
        <div className="update-actions">
          <button className="primary-button" onClick={onUpdate}>
            立即更新
          </button>
          {!isForceUpdate && (
            <button className="ghost-button" onClick={onSkip}>
              稍后再说
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default UpdateDialog
