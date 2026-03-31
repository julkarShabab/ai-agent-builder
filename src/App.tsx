import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentProfile { id: string; name: string; description: string }
interface Skill { id: string; name: string; category: string; description: string }
interface Layer { id: string; name: string; type: string; description: string }
interface AgentData { agentProfiles: AgentProfile[]; skills: Skill[]; layers: Layer[] }
interface SavedAgent {
  id: string
  name: string
  profileId: string
  skillIds: string[]
  layerIds: string[]
  provider?: string
}

// ─── DraggableCard ────────────────────────────────────────────────────────────

const DraggableCard = memo(({ id, title, subtitle }: {
  id: string; title: string; subtitle: string
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform) }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-gray-800 border rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing transition-all select-none ${
        isDragging ? 'opacity-30 border-indigo-500' : 'border-gray-700 hover:border-indigo-600'
      }`}
    >
      <p className="text-sm text-white font-medium">{title}</p>
      <p className="text-xs text-gray-400">{subtitle}</p>
    </div>
  )
})

// ─── SortableItem ─────────────────────────────────────────────────────────────

const SortableItem = memo(({ id, label, onRemove, color }: {
  id: string; label: string; onRemove: (id: string) => void; color: string
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center justify-between bg-gray-800 border rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing select-none ${
        isDragging ? 'opacity-40' : ''
      } ${color}`}
    >
      <span className="text-sm text-white">⠿ {label}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(id) }}
        className="text-gray-400 hover:text-red-400 text-lg leading-none ml-2"
      >
        ×
      </button>
    </div>
  )
})

// ─── DropZone ─────────────────────────────────────────────────────────────────

const DropZone = memo(({ id, children, label, isEmpty }: {
  id: string; children: React.ReactNode; label: string; isEmpty: boolean
}) => {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`min-h-24 rounded-xl border-2 border-dashed p-3 transition-all ${
        isOver ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-700 bg-gray-800/30'
      }`}
    >
      {isEmpty && (
        <p className="text-xs text-gray-600 text-center mt-4">
          {isOver ? `✨ Drop to add ${label}` : `Drag ${label} here`}
        </p>
      )}
      {children}
    </div>
  )
})

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [data, setData] = useState<AgentData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<string>('')
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [selectedLayers, setSelectedLayers] = useState<string[]>([])
  const [agentName, setAgentName] = useState('')
  const [savedAgents, setSavedAgents] = useState<SavedAgent[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [sessionTime, setSessionTime] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const providers = ['Gemini', 'ChatGPT', 'Kimi', 'Claude', 'DeepSeek']

  // ─── Memoized lookups ─────────────────────────────────────────────────────

  const profileMap = useMemo(() => {
    if (!data) return {} as Record<string, AgentProfile>
    return Object.fromEntries(data.agentProfiles.map(p => [p.id, p]))
  }, [data])

  const skillMap = useMemo(() => {
  if (!data) return {} as Record<string, Skill>
  return Object.fromEntries(data.skills.map(s => [s.id, s]))
}, [data])

const layerMap = useMemo(() => {
  if (!data) return {} as Record<string, Layer>
  return Object.fromEntries(data.layers.map(l => [l.id, l]))
}, [data])

  const selectedProfileData = useMemo(
    () => profileMap[selectedProfile] ?? null,
    [profileMap, selectedProfile]
  )

 const selectedSkillsData = useMemo(
  () => selectedSkills.map(id => skillMap[id]).filter(Boolean),
  [selectedSkills, skillMap]
)

const selectedLayersData = useMemo(
  () => selectedLayers.map(id => layerMap[id]).filter(Boolean),
  [selectedLayers, layerMap]
)

  const availableSkills = useMemo(
    () => data?.skills.filter(s => !selectedSkills.includes(s.id)) ?? [],
    [data, selectedSkills]
  )

  const availableLayers = useMemo(
    () => data?.layers.filter(l => !selectedLayers.includes(l.id)) ?? [],
    [data, selectedLayers]
  )

  const activeItem = useMemo(() => {
    if (!activeId) return null
    return skillMap[activeId] || layerMap[activeId] || null
  }, [activeId, data])

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => setSessionTime(prev => prev + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('savedAgents')
    if (saved) {
      try { setSavedAgents(JSON.parse(saved)) }
      catch (e) { console.error('Failed to parse saved agents', e) }
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      console.log(agentName !== ''
        ? `[Analytics] Working on: "${agentName}"`
        : `[Analytics] Working on unnamed draft...`
      )
    }, 8000)
    return () => clearInterval(interval)
  }, [agentName])

  // ─── API ──────────────────────────────────────────────────────────────────

  const fetchAPI = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/data.json')
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const jsonData: AgentData = await response.json()
      setData(jsonData)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch agent data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAPI() }, [fetchAPI])

  // ─── Drag handlers ────────────────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Drop into skills zone
    if (overId === 'skills-dropzone' && data?.skills.find(s => s.id === activeId)) {
      setSelectedSkills(prev => prev.includes(activeId) ? prev : [...prev, activeId])
      return
    }

    // Drop into layers zone
    if (overId === 'layers-dropzone' && data?.layers.find(l => l.id === activeId)) {
      setSelectedLayers(prev => prev.includes(activeId) ? prev : [...prev, activeId])
      return
    }

    // Reorder skills
    if (selectedSkills.includes(activeId) && selectedSkills.includes(overId)) {
      setSelectedSkills(prev => arrayMove(prev, prev.indexOf(activeId), prev.indexOf(overId)))
      return
    }

    // Reorder layers
    if (selectedLayers.includes(activeId) && selectedLayers.includes(overId)) {
      setSelectedLayers(prev => arrayMove(prev, prev.indexOf(activeId), prev.indexOf(overId)))
    }
  }, [data, selectedSkills, selectedLayers])

  // ─── Agent handlers ───────────────────────────────────────────────────────

  const handleRemoveSkill = useCallback((id: string) => {
    setSelectedSkills(prev => prev.filter(s => s !== id))
  }, [])

  const handleRemoveLayer = useCallback((id: string) => {
    setSelectedLayers(prev => prev.filter(l => l !== id))
  }, [])

  const saveToLocalStorage = useCallback((agents: SavedAgent[]) => {
    try {
      localStorage.setItem('savedAgents', JSON.stringify(agents))
    } catch (e) {
      console.error('Failed to save agents to localStorage', e)
    }
  }, [])

  const handleSaveAgent = useCallback(() => {
    if (!agentName.trim()) { alert('Please enter a name for your agent.'); return }
    const newAgent: SavedAgent = {
      id: crypto.randomUUID(),
      name: agentName,
      profileId: selectedProfile,
      skillIds: selectedSkills,
      layerIds: selectedLayers,
      provider: selectedProvider,
    }
    const updated = [...savedAgents, newAgent]
    setSavedAgents(updated)
    saveToLocalStorage(updated)
    setAgentName('')
    alert(`Agent "${newAgent.name}" saved!`)
  }, [agentName, selectedProfile, selectedSkills, selectedLayers, selectedProvider, savedAgents, saveToLocalStorage])

  const handleLoadAgent = useCallback((agent: SavedAgent) => {
    setSelectedProfile(agent.profileId || '')
    setSelectedSkills(agent.skillIds || [])
    setSelectedLayers([...(agent.layerIds || [])])
    setAgentName(agent.name)
    setSelectedProvider(agent.provider || '')
  }, [])

  const handleDeleteAgent = useCallback((id: string) => {
    const updated = savedAgents.filter(a => a.id !== id)
    setSavedAgents(updated)
    saveToLocalStorage(updated)
  }, [savedAgents, saveToLocalStorage])

  const handleClearAll = useCallback(() => {
    setSavedAgents([])
    localStorage.removeItem('savedAgents')
    setConfirmClear(false)
  }, [])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-gray-950 text-white">

        {/* Header */}
        <header className="border-b border-gray-800 bg-gray-900 px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">🤖 AI Agent Builder</h1>
            <p className="text-gray-400 text-sm mt-1">Drag and drop to build your custom AI agent</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1 rounded-full">
              ⏱ {sessionTime}s
            </span>
            <button
              onClick={fetchAPI}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {loading ? 'Loading...' : '↺ Reload'}
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-8 py-8">
          {error && (
            <div className="mb-6 bg-red-900/40 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
              ⚠️ {error}
            </div>
          )}

          {/* Loading Skeleton */}
          {loading && !data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-pulse">
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 h-96" />
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 h-96" />
            </div>
          )}

          {data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* LEFT PANEL */}
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
                <h2 className="text-lg font-semibold mb-6">⚙️ Available Components</h2>
                <div className="flex flex-col gap-6">

                  {/* Profile */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Base Profile</label>
                    <select
                      value={selectedProfile}
                      onChange={(e) => setSelectedProfile(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Select a Profile --</option>
                      {data.agentProfiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Skills */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      🧠 Skills <span className="text-gray-500 font-normal">(drag into agent)</span>
                    </label>
                    <SortableContext items={availableSkills.map(s => s.id)} strategy={verticalListSortingStrategy}>
                      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                        {availableSkills.map(s => (
                          <DraggableCard key={s.id} id={s.id} title={s.name} subtitle={s.category} />
                        ))}
                        {availableSkills.length === 0 && (
                          <p className="text-xs text-gray-600 text-center py-4">All skills added ✓</p>
                        )}
                      </div>
                    </SortableContext>
                  </div>

                  {/* Layers */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      🎭 Personality Layers <span className="text-gray-500 font-normal">(drag into agent)</span>
                    </label>
                    <SortableContext items={availableLayers.map(l => l.id)} strategy={verticalListSortingStrategy}>
                      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                        {availableLayers.map(l => (
                          <DraggableCard key={l.id} id={l.id} title={l.name} subtitle={l.type} />
                        ))}
                        {availableLayers.length === 0 && (
                          <p className="text-xs text-gray-600 text-center py-4">All layers added ✓</p>
                        )}
                      </div>
                    </SortableContext>
                  </div>

                  {/* Provider */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">⚡ AI Provider</label>
                    <div className="flex flex-wrap gap-2">
                      {providers.map(provider => (
                        <button
                          key={provider}
                          onClick={() => setSelectedProvider(provider)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            selectedProvider === provider
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          {provider}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT PANEL */}
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
                <h2 className="text-lg font-semibold mb-6">👁️ Agent Configuration</h2>

                {/* Profile preview */}
                <div className="mb-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Profile</p>
                  {selectedProfileData ? (
                    <div className="bg-gray-800 rounded-lg p-3">
                      <p className="text-sm font-medium text-indigo-400">{selectedProfileData.name}</p>
                      <p className="text-xs text-gray-400 mt-1">{selectedProfileData.description}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">No profile selected</p>
                  )}
                </div>

                {/* Skills drop zone */}
                <div className="mb-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Skills</p>
                  <DropZone id="skills-dropzone" label="skills" isEmpty={selectedSkills.length === 0}>
                    <SortableContext items={selectedSkills} strategy={verticalListSortingStrategy}>
                      <div className="flex flex-col gap-2">
                        {selectedSkillsData.map(skill => (
                          <SortableItem
                            key={skill.id}
                            id={skill.id}
                            label={skill.name}
                            color="border-indigo-800"
                            onRemove={handleRemoveSkill}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DropZone>
                </div>

                {/* Layers drop zone */}
                <div className="mb-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Personality Layers</p>
                  <DropZone id="layers-dropzone" label="layers" isEmpty={selectedLayers.length === 0}>
                    <SortableContext items={selectedLayers} strategy={verticalListSortingStrategy}>
                      <div className="flex flex-col gap-2">
                        {selectedLayersData.map(layer => (
                          <SortableItem
                            key={layer.id}
                            id={layer.id}
                            label={layer.name}
                            color="border-purple-800"
                            onRemove={handleRemoveLayer}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DropZone>
                </div>

                {/* Provider */}
                <div className="mb-6">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Provider</p>
                  {selectedProvider ? (
                    <span className="bg-green-900/50 border border-green-700 text-green-300 text-xs px-3 py-1 rounded-full">
                      {selectedProvider}
                    </span>
                  ) : (
                    <p className="text-sm text-gray-600">No provider selected</p>
                  )}
                </div>

                {/* Save */}
                <div className="border-t border-gray-800 pt-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Save Agent</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter agent name..."
                      value={agentName}
                      onChange={e => setAgentName(e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
                    />
                    <button
                      onClick={handleSaveAgent}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Saved Agents */}
          {savedAgents.length > 0 ? (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">💾 Saved Agents</h2>
                {confirmClear ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Are you sure?</span>
                    <button
                      onClick={handleClearAll}
                      className="text-xs text-red-400 bg-red-900/30 border border-red-800 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Yes, clear
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="text-xs text-gray-400 bg-gray-800 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="text-xs text-red-400 hover:text-red-300 bg-red-900/30 border border-red-800 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {savedAgents.map(agent => (
                  <div
                    key={agent.id}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-indigo-700 transition-colors"
                  >
                    <h3 className="font-semibold text-white mb-3">{agent.name}</h3>
                    <div className="flex flex-col gap-1 text-xs text-gray-400 mb-4">
                      <span>📋 {profileMap[agent.profileId]?.name ?? 'No Profile'}</span>
                      <span>🧠 {agent.skillIds?.length || 0} skills</span>
                      <span>🎭 {agent.layerIds?.length || 0} layers</span>
                      <span>⚡ {agent.provider || 'No provider'}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleLoadAgent(agent)}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-1.5 rounded-lg transition-colors"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeleteAgent(agent.id)}
                        className="bg-red-900/50 hover:bg-red-900 text-red-400 text-xs px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-8 text-center py-12 border border-dashed border-gray-800 rounded-2xl">
              <p className="text-gray-600 text-sm">No saved agents yet. Build and save your first agent above!</p>
            </div>
          )}
        </main>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeItem && (
          <div className="bg-indigo-800 border border-indigo-500 rounded-lg px-3 py-2 shadow-xl rotate-2 opacity-90">
            <p className="text-sm text-white font-medium">{activeItem.name}</p>
            <p className="text-xs text-indigo-300">
              {'category' in activeItem ? activeItem.category : activeItem.type}
            </p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

export default App