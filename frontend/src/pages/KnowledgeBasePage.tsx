import { useEffect, useState } from 'react'
import { BookOpen, Tag } from 'lucide-react'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import { useToast } from '../components/Toast'
import { endpoints } from '../api/client'

const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
  gst_rules:     { color: '#0369a1', bg: '#eff6ff' },
  reconciliation:{ color: '#7c3aed', bg: '#f5f3ff' },
  compliance:    { color: '#d97706', bg: '#fffbeb' },
  audit:         { color: '#16a34a', bg: '#f0fdf4' },
}

export default function KnowledgeBasePage() {
  const [docs, setDocs]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    ;(async () => {
      try {
        const res = await endpoints.knowledgeDocs()
        setDocs(res.data.documents)
      } catch {
        toast('Failed to load knowledge base', 'error')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <Layout title="Knowledge Base" breadcrumb="Data">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, marginTop: -8, maxWidth: 600 }}>
        Policy documents retrieved by the AI investigation agent via TF-IDF cosine-similarity. Swappable for
        pgvector embeddings in production.
      </p>
      {loading ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {docs.map((d) => {
            const cat = CATEGORY_COLORS[d.category] || { color: '#64748b', bg: '#f8fafc' }
            return (
              <div key={d.id} className="card" style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <BookOpen size={14} color={cat.color} />
                    </div>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {d.title}
                    </h3>
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    color: cat.color, background: cat.bg, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    <Tag size={9} /> {d.category}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
                  {d.content}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
