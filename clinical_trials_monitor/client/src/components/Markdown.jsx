// Minimal, dependency-free, XSS-safe Markdown renderer.
// Builds React elements (no dangerouslySetInnerHTML). Supports the subset the
// dossier generator emits: headings, tables, blockquotes, lists, hr,
// paragraphs, and inline bold / italic / code / links.

import { Fragment } from 'react'

function renderInline(text, keyPrefix) {
    // Tokenize on: links [t](u), bold **x**, code `x`, italic *x*
    const re = /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(`[^`]+`)|(\*[^*]+\*)/g
    const out = []
    let last = 0
    let m
    let i = 0
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index))
        const tok = m[0]
        const k = `${keyPrefix}-i${i++}`
        if (tok.startsWith('[')) {
            const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)
            out.push(
                <a key={k} href={mm[2]} target="_blank" rel="noreferrer"
                   className="text-indigo-600 hover:underline break-words">
                    {mm[1]}
                </a>
            )
        } else if (tok.startsWith('**')) {
            out.push(<strong key={k}>{tok.slice(2, -2)}</strong>)
        } else if (tok.startsWith('`')) {
            out.push(
                <code key={k} className="bg-gray-100 text-pink-700 px-1 rounded text-xs">
                    {tok.slice(1, -1)}
                </code>
            )
        } else {
            out.push(<em key={k}>{tok.slice(1, -1)}</em>)
        }
        last = m.index + tok.length
    }
    if (last < text.length) out.push(text.slice(last))
    return out
}

function splitRow(line) {
    return line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
}

export default function Markdown({ text }) {
    const lines = (text || '').split('\n')
    const blocks = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        if (!line.trim()) { i++; continue }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
            blocks.push(<hr key={i} className="my-6 border-gray-200" />)
            i++; continue
        }

        // Headings
        const h = /^(#{1,4})\s+(.*)$/.exec(line)
        if (h) {
            const lvl = h[1].length
            const cls = {
                1: 'text-2xl font-bold text-gray-900 mt-2 mb-3',
                2: 'text-xl font-bold text-gray-900 mt-8 mb-3 border-b pb-1',
                3: 'text-lg font-semibold text-gray-800 mt-5 mb-2',
                4: 'text-base font-semibold text-gray-700 mt-4 mb-2',
            }[lvl]
            const Tag = `h${lvl}`
            blocks.push(<Tag key={i} className={cls}>{renderInline(h[2], `h${i}`)}</Tag>)
            i++; continue
        }

        // Table
        if (line.trim().startsWith('|') && i + 1 < lines.length &&
            /^\|?[\s:-]+\|/.test(lines[i + 1].trim())) {
            const header = splitRow(line)
            i += 2
            const rows = []
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                rows.push(splitRow(lines[i])); i++
            }
            blocks.push(
                <div key={`t${i}`} className="overflow-x-auto my-4">
                    <table className="min-w-full text-sm border border-gray-200">
                        <thead className="bg-gray-50">
                            <tr>{header.map((c, x) => (
                                <th key={x} className="px-3 py-2 text-left font-semibold
                                    text-gray-700 border-b border-gray-200">
                                    {renderInline(c, `th${i}-${x}`)}
                                </th>
                            ))}</tr>
                        </thead>
                        <tbody>{rows.map((r, y) => (
                            <tr key={y} className={y % 2 ? 'bg-gray-50' : 'bg-white'}>
                                {r.map((c, x) => (
                                    <td key={x} className="px-3 py-2 align-top
                                        text-gray-700 border-b border-gray-100">
                                        {renderInline(c, `td${i}-${y}-${x}`)}
                                    </td>
                                ))}
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )
            continue
        }

        // Blockquote (consecutive > lines)
        if (line.trim().startsWith('>')) {
            const buf = []
            while (i < lines.length && lines[i].trim().startsWith('>')) {
                buf.push(lines[i].trim().replace(/^>\s?/, '')); i++
            }
            blocks.push(
                <blockquote key={`q${i}`} className="border-l-4 border-indigo-300
                    bg-indigo-50 px-4 py-2 my-3 text-gray-700 text-sm">
                    {renderInline(buf.join(' '), `q${i}`)}
                </blockquote>
            )
            continue
        }

        // Lists (- or 1.)
        if (/^(\s*[-*]|\s*\d+\.)\s+/.test(line)) {
            const items = []
            const ordered = /^\s*\d+\.\s+/.test(line)
            while (i < lines.length && /^(\s*[-*]|\s*\d+\.)\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^(\s*[-*]|\s*\d+\.)\s+/, '')); i++
            }
            const ListTag = ordered ? 'ol' : 'ul'
            blocks.push(
                <ListTag key={`l${i}`} className={`my-3 ml-6 space-y-1 text-gray-700
                    text-sm ${ordered ? 'list-decimal' : 'list-disc'}`}>
                    {items.map((it, x) => (
                        <li key={x}>{renderInline(it, `li${i}-${x}`)}</li>
                    ))}
                </ListTag>
            )
            continue
        }

        // Paragraph (gather until blank line)
        const buf = []
        while (i < lines.length && lines[i].trim() &&
               !/^(#{1,4}\s|>|\||\s*[-*]\s|\s*\d+\.\s|---+$)/.test(lines[i])) {
            buf.push(lines[i].trim()); i++
        }
        blocks.push(
            <p key={`p${i}`} className="my-3 text-gray-700 text-sm leading-relaxed">
                {renderInline(buf.join(' '), `p${i}`)}
            </p>
        )
    }

    return <Fragment>{blocks}</Fragment>
}
