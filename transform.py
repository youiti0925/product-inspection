import re
import sys

# Read original source
with open('/c/Users/anrw3/Downloads/製品検査アプリ_20260314.txt', 'r', encoding='utf-8') as f:
    src = f.read()

print(f"Read source: {len(src)} chars")

# 1. Change APP_DATA_ID
src = src.replace('const APP_DATA_ID = "genba-visual-shared-v1";', 'const APP_DATA_ID = "product-inspection-v1";')

# 2. Add ExcelJS and JSZip imports after firebase auth import block
firebase_auth_end = 'from "firebase/auth";'
idx = src.index(firebase_auth_end) + len(firebase_auth_end)
src = src[:idx] + "\n\nimport ExcelJS from 'exceljs';\nimport JSZip from 'jszip';" + src[idx:]

# 3. Remove DebugStatus component definition
debug_start = src.index('// --- Debug Status Component')
debug_end_marker = '// ----------------------------------------------------------------------\n// 2. Complex & Functional Components'
debug_end = src.index(debug_end_marker)
src = src[:debug_start] + src[debug_end:]

# 4. Remove DebugStatus usage at bottom
dbg_line = '       <DebugStatus isConnected={isConnected} user={user} dataCounts={dataCounts} syncStatus={syncStatus} appId={APP_DATA_ID} errorMsg={errorMsg} dataSource={dataSource} onTestWrite={handleTestWrite} projectId={USER_DEFINED_CONFIG.projectId} onReload={handleReload} />'
src = src.replace('       {/* Debug Status Panel */}\n' + dbg_line, '')

# 5. Remove handleReload
src = src.replace('   // Reload Action\n    const handleReload = () => {\n        window.location.reload();\n    };\n', '')

# 6. Remove handleTestWrite
test_write_start = src.index('   // Test Write Action')
test_write_end = src.index('\n   const saveSettings', test_write_start)
src = src[:test_write_start] + src[test_write_end:]

# 7. Remove CSS imports
src = src.replace("import './index.css';\n", "")
src = src.replace("import './App.css';\n", "")

# 8. Add DEFAULT_DEFECT_PROCESS_OPTIONS
map_zones_end = src.index('];', src.index('INITIAL_MAP_ZONES'))
map_zones_end = src.index('\n', map_zones_end) + 1
src = src[:map_zones_end] + "\nconst DEFAULT_DEFECT_PROCESS_OPTIONS = ['\u524d\u73ed', '\u8a2d\u8a08', '\u8abf\u9054', '\u6a5f\u68b0'];\n" + src[map_zones_end:]

# 9. Remove ExcelJS CDN loading useEffect
excel_load_start = src.index('  // --- Initialize ExcelJS ---')
excel_load_end = src.index('  // --- Firebase Initialization ---')
src = src[:excel_load_start] + src[excel_load_end:]

# 10. Remove isExcelLoaded state and usage
src = src.replace('  const [isExcelLoaded, setIsExcelLoaded] = useState(false);\n', '')
src = src.replace('if (!file || !isExcelLoaded) return;', 'if (!file) return;')

# 11. UI: Header bg
src = src.replace('className="h-14 bg-slate-900 text-white', 'className="h-14 bg-slate-800 text-white')

# 12. UI: Tab container
src = src.replace(
    '<div className="flex bg-slate-800 rounded-lg p-1">',
    '<div className="flex bg-slate-200 p-1 rounded-lg">'
)
src = src.replace(
    "activeTab === tab.id ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'",
    "activeTab === tab.id ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'"
)

# 13. UI: Modal backdrop-blur
src = src.replace(
    'className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"',
    'className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"'
)
# For slate-900/90 modals - do all occurrences
src = src.replace(
    'bg-slate-900/90 flex items-center justify-center p-4"',
    'bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4"'
)

# 14. UI: Card styling
src = src.replace(
    "const styleClass = `relative w-full cursor-grab active:cursor-grabbing mb-2 shadow-sm bg-white border transition-all`;",
    "const styleClass = `relative w-full cursor-grab active:cursor-grabbing mb-2 shadow-sm bg-white border transition-all rounded-xl`;"
)
src = src.replace("'border-slate-300 hover:border-blue-400'", "'border-slate-200 hover:border-blue-400'")
src = src.replace(
    "className={`${styleClass} ${borderClass} ${draggedLotId === lot.id ? 'opacity-50' : 'opacity-100'}`}",
    "className={`${styleClass} ${borderClass} ${draggedLotId === lot.id ? 'opacity-50' : 'opacity-100'} group`}"
)

# 15. Button colors
src = src.replace(
    'className="bg-blue-600 hover:bg-blue-500 text-white',
    'className="bg-blue-600 hover:bg-blue-700 text-white'
)

# 16. Settings state with defectProcessOptions
src = src.replace(
    "const [settings, setSettings] = useState({ mapImage: null, mapZones: INITIAL_MAP_ZONES });",
    "const [settings, setSettings] = useState({ mapImage: null, mapZones: INITIAL_MAP_ZONES, defectProcessOptions: DEFAULT_DEFECT_PROCESS_OPTIONS });"
)
src = src.replace(
    "setSettings({ \n              mapImage: data.mapImage || null,\n              mapZones: data.mapZones || INITIAL_MAP_ZONES \n            });",
    "setSettings({ \n              mapImage: data.mapImage || null,\n              mapZones: data.mapZones || INITIAL_MAP_ZONES,\n              defectProcessOptions: data.defectProcessOptions || DEFAULT_DEFECT_PROCESS_OPTIONS\n            });"
)

# 17. Enhanced defect reporting - add states
old_defect_states = "  const [showDefectModal, setShowDefectModal] = useState(false);\n  const [defectLabel, setDefectLabel] = useState('');"
new_defect_states = "  const [showDefectModal, setShowDefectModal] = useState(false);\n  const [defectLabel, setDefectLabel] = useState('');\n  const [defectCauseProcess, setDefectCauseProcess] = useState('');\n  const [defectPhotos, setDefectPhotos] = useState([]);\n  const defectPhotoRef = useRef(null);"
src = src.replace(old_defect_states, new_defect_states)

# Add defectProcessOptions prop
src = src.replace(
    'const WorkExecutionModal = ({ lot, onClose, onSave, onFinish }) => {',
    'const WorkExecutionModal = ({ lot, onClose, onSave, onFinish, defectProcessOptions }) => {'
)

# Update startInterruption
old_si = "  const startInterruption = (type, label) => {\n      const newInt = {\n          id: generateId(),\n          type,\n          label,\n          startTime: Date.now(),\n          duration: 0,\n          status: 'active'\n      };\n      const updated = [...interruptions, newInt];\n      setInterruptions(updated);\n      onSave({ interruptions: updated });\n      if (type === 'defect') setShowDefectModal(false);\n  };"
new_si = """  const startInterruption = (type, label, causeProcess, photos) => {
      const curStep = localSteps[currentStepIdx] || localSteps[0];
      const newInt = {
          id: generateId(),
          type,
          label,
          timestamp: Date.now(),
          startTime: Date.now(),
          duration: 0,
          status: 'active',
          workerName: lot.workerId || '',
          stepInfo: curStep ? { stepId: curStep.id, title: curStep.title } : null,
          causeProcess: causeProcess || '',
          photos: photos || []
      };
      const updated = [...interruptions, newInt];
      setInterruptions(updated);
      onSave({ interruptions: updated });
      if (type === 'defect') {
        setShowDefectModal(false);
        setDefectLabel('');
        setDefectCauseProcess('');
        setDefectPhotos([]);
      }
  };"""
src = src.replace(old_si, new_si)

# Update defect modal UI in custom mode
old_dm_start = '            <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">'
old_dm_end = "                        <button onClick={()=>startInterruption('defect', defectLabel)} className=\"px-4 py-2 bg-rose-600 text-white rounded font-bold\">\u5bfe\u5fdc\u958b\u59cb</button>\n                    </div>\n                </div>\n            </div>"
old_dm_idx = src.index(old_dm_start)
old_dm_end_idx = src.index(old_dm_end) + len(old_dm_end)
old_dm = src[old_dm_idx:old_dm_end_idx]

new_dm = """            <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-rose-600"><AlertCircle className="w-5 h-5"/> 不具合報告</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">不具合内容</label>
                        <textarea className="w-full border rounded-lg p-2" rows={3} placeholder="不具合の内容を入力..." value={defectLabel} onChange={e=>setDefectLabel(e.target.value)}/>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">原因工程</label>
                        <select className="w-full border rounded-lg p-2" value={defectCauseProcess} onChange={e=>setDefectCauseProcess(e.target.value)}>
                          <option value="">選択してください</option>
                          {(defectProcessOptions || DEFAULT_DEFECT_PROCESS_OPTIONS).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">写真添付</label>
                        <div className="flex gap-2 flex-wrap">
                          {defectPhotos.map((p, i) => (
                            <div key={i} className="w-16 h-16 border rounded overflow-hidden relative group/ph">
                              <img src={p} className="w-full h-full object-cover"/>
                              <button onClick={()=>setDefectPhotos(prev=>prev.filter((_,idx)=>idx!==i))} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl p-0.5 opacity-0 group-hover/ph:opacity-100"><X className="w-3 h-3"/></button>
                            </div>
                          ))}
                          <button onClick={()=>defectPhotoRef.current?.click()} className="w-16 h-16 border-2 border-dashed rounded flex items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-300">
                            <Camera className="w-5 h-5"/>
                          </button>
                          <input type="file" ref={defectPhotoRef} className="hidden" accept="image/*" onChange={async(e)=>{const file=e.target.files?.[0]; if(file){const img=await resizeImage(file); setDefectPhotos(prev=>[...prev, img]);} e.target.value='';}}/>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={()=>{setShowDefectModal(false);setDefectLabel('');setDefectCauseProcess('');setDefectPhotos([]);}} className="px-4 py-2 text-slate-500">キャンセル</button>
                        <button onClick={()=>startInterruption('defect', defectLabel, defectCauseProcess, defectPhotos)} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold">対応開始</button>
                    </div>
                </div>
            </div>"""
src = src.replace(old_dm, new_dm)

# Pass defectProcessOptions to WorkExecutionModal in render
old_wem = """<WorkExecutionModal
           lot={lots.find(l => l.id === executionLotId)}
           onClose={() => setExecutionLotId(null)}
           onSave={(updates) => saveData('lots', executionLotId, updates)}
           onFinish={() => setExecutionLotId(null)}
         />"""
new_wem = """<WorkExecutionModal
           lot={lots.find(l => l.id === executionLotId)}
           onClose={() => setExecutionLotId(null)}
           onSave={(updates) => saveData('lots', executionLotId, updates)}
           onFinish={() => setExecutionLotId(null)}
           defectProcessOptions={settings.defectProcessOptions}
         />"""
src = src.replace(old_wem, new_wem)

# Fix monitoring startInterruption calls
src = src.replace(
    "startInterruption('monitoring', step.title)",
    "startInterruption('monitoring', step.title, '', [])"
)

# 18. Remove dataCounts/dataSource state (only used by removed DebugStatus)
src = src.replace("  const [dataCounts, setDataCounts] = useState({ lots: 0, templates: 0, workers: 0 });\n", "")
src = src.replace("  const [dataSource, setDataSource] = useState('Checking...');\n", "")
src = src.replace("          setDataCounts(prev => ({ ...prev, lots: data.length }));\n", "")
src = src.replace("          setDataSource(snap.metadata.fromCache ? 'Cache (Offline)' : 'Server (Online)');\n", "")
src = src.replace("          setDataCounts(prev => ({ ...prev, templates: data.length }));\n", "")
src = src.replace("          setDataCounts(prev => ({ ...prev, workers: data.length }));\n", "")

# 19. Fix filenames
src = src.replace("genba_detailed_report_", "product_inspection_detailed_")
src = src.replace("genba_visual_", "product_inspection_")
src = src.replace("genba_backup_", "product_inspection_backup_")

# 20. Fix app title
src = src.replace(
    'Genba Visual Cloud <span className="text-xs font-normal text-slate-400 ml-1">Pro</span>',
    '\u88fd\u54c1\u691c\u67fb\u30a2\u30d7\u30ea <span className="text-xs font-normal text-slate-400 ml-1">Pro</span>'
)

print(f"Phase 1 complete: {len(src)} chars")

# Write intermediate
with open('/c/Users/anrw3/product-inspection-app/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(src)

print("Phase 1 written successfully")
