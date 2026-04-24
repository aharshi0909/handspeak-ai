const express = require('express')
const cors = require('cors')
const fs = require('fs').promises
const path = require('path')

const app = express()
const PORT = 3000
const DATA_FILE = path.join(__dirname, 'gesture_dataset.json')

app.use(cors())
app.use(express.json({ limit: '500mb' }))

async function readDataset() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8')
    return JSON.parse(data)
  } catch {
    const empty = {}
    await writeDataset(empty)
    return empty
  }
}

async function writeDataset(dataset) {
  await fs.writeFile(DATA_FILE, JSON.stringify(dataset, null, 2))
}

app.post('/add', async (req, res) => {
  try {
    const { dataset: incoming } = req.body
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Invalid dataset' })
    }

    const existing = await readDataset()
    let added = 0

    for (const label in incoming) {
      if (!existing[label]) existing[label] = []
      const examples = incoming[label].filter(ex => Array.isArray(ex) && ex.length > 0)
      existing[label].push(...examples)
      added += examples.length
    }

    await writeDataset(existing)
    res.json({ success: true, examplesAdded: added })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/fetch', async (req, res) => {
  try {
    const dataset = await readDataset()
    res.json(dataset)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/share', async (req, res) => {
  try {
    const dataset = await readDataset()

    const payload = dataset

    res.setHeader('Content-Type', 'application/json')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="gesture-raw-${Date.now()}.json"`
    )
    res.send(JSON.stringify(payload, null, 2))
  } catch {
    res.status(500).json({ error: 'Server error' })
  }
})


app.post('/check-conflicts', async (req, res) => {
  try {
    const { dataset: incoming } = req.body
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Invalid dataset' })
    }

    const existing = await readDataset()
    const conflicts = []
    const newLabels = []

    for (const label in incoming) {
      if (existing[label]) {
        conflicts.push({
          label,
          existingCount: existing[label].length,
          incomingCount: incoming[label].length
        })
      } else {
        newLabels.push(label)
      }
    }

    res.json({ hasConflicts: conflicts.length > 0, conflicts, newLabels })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/merge-dataset', async (req, res) => {
  try {
    const { dataset: incoming, replacements = [], rejections = [] } = req.body
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Invalid dataset' })
    }

    const existing = await readDataset()
    let addedCount = 0
    let replacedCount = 0
    let rejectedCount = 0

    for (const label in incoming) {
      const examples = incoming[label].filter(ex => Array.isArray(ex) && ex.length > 0)

      if (replacements.includes(label)) {
        existing[label] = examples
        replacedCount += 1
        addedCount += examples.length
      } else if (!rejections.includes(label)) {
        if (!existing[label]) existing[label] = []
        existing[label].push(...examples)
        addedCount += examples.length
      } else {
        rejectedCount += 1
      }
    }

    await writeDataset(existing)
    res.json({ addedCount, replacedCount, rejectedCount })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/replace-dataset', async (req, res) => {
  try {
    const { dataset: incoming } = req.body
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Invalid dataset' })
    }

    const clean = {}
    for (const label in incoming) {
      clean[label] = incoming[label].filter(ex => Array.isArray(ex) && ex.length > 0)
    }

    await writeDataset(clean)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/stats', async (req, res) => {
  try {
    const dataset = await readDataset()
    const gestures = Object.entries(dataset)
      .map(([label, examples]) => ({ label, count: examples.length }))
      .sort((a, b) => b.count - a.count)

    const totalExamples = gestures.reduce((s, g) => s + g.count, 0)

    res.json({
      totalGestures: gestures.length,
      totalExamples,
      gestures
    })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/delete-gesture', async (req, res) => {
  try {
    const { label } = req.body
    if (!label || typeof label !== 'string') {
      return res.status(400).json({ error: 'Invalid label' })
    }

    const dataset = await readDataset()
    if (!dataset[label]) {
      return res.status(404).json({ error: 'Gesture not found' })
    }

    delete dataset[label]
    await writeDataset(dataset)
    res.json({ success: true, deletedLabel: label })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

app.post('/clear-database', async (req, res) => {
  try {
    await writeDataset({})
    res.json({ success: true, message: 'Database cleared' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, async () => {
  console.log(`\nGesture Backend RUNNING on http://localhost:${PORT}`)
  console.log(`Dataset: ${DATA_FILE}\n`)
  try {
    const data = await readDataset()
    const count = Object.keys(data).length
    const examples = Object.values(data).reduce((s, a) => s + a.length, 0)
    console.log(`Loaded: ${count} gestures, ${examples} examples`)
  } catch {
    console.log(`No dataset found. Starting fresh.`)
  }
})