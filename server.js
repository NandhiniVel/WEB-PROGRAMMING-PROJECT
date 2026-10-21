const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'pets.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `pet-${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'));
    }
  }
});

// Helper to read pets
function getPets() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return [];
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading pets file:', err);
    return [];
  }
}

// Helper to write pets
function savePets(pets) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(pets, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving pets file:', err);
    return false;
  }
}

// --- API ROUTES ---

// 1. Get statistics
app.get('/api/stats', (req, res) => {
  const pets = getPets();
  const stats = {
    total: pets.length,
    adoptable: pets.filter(p => p.status === 'adoptable').length,
    pending: pets.filter(p => p.status === 'pending').length,
    adopted: pets.filter(p => p.status === 'adopted').length
  };
  res.json(stats);
});

// 2. Get pets with filtering & search
app.get('/api/pets', (req, res) => {
  const { status, species, size, search, sort } = req.query;
  let pets = getPets();

  // Filter by status
  if (status && status !== 'all') {
    pets = pets.filter(p => p.status.toLowerCase() === status.toLowerCase());
  }

  // Filter by species
  if (species && species !== 'all') {
    pets = pets.filter(p => p.species.toLowerCase() === species.toLowerCase());
  }

  // Filter by size
  if (size && size !== 'all') {
    pets = pets.filter(p => (p.size || '').toLowerCase() === size.toLowerCase());
  }

  // Filter by search query
  if (search && search.trim() !== '') {
    const q = search.toLowerCase().trim();
    pets = pets.filter(p => {
      const traitsStr = (p.traits || []).join(' ').toLowerCase();
      const goodWithStr = (p.goodWith || []).join(' ').toLowerCase();
      return (
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.breed && p.breed.toLowerCase().includes(q)) ||
        (p.species && p.species.toLowerCase().includes(q)) ||
        (p.location && p.location.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.primaryColor && p.primaryColor.toLowerCase().includes(q)) ||
        traitsStr.includes(q) ||
        goodWithStr.includes(q)
      );
    });
  }

  // Sort
  if (sort === 'oldest') {
    pets.sort((a, b) => new Date(a.createdAt || a.date) - new Date(b.createdAt || b.date));
  } else if (sort === 'name') {
    pets.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else {
    // Default newest first
    pets.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
  }

  res.json(pets);
});

// 3. Get single pet by ID
app.get('/api/pets/:id', (req, res) => {
  const pets = getPets();
  const pet = pets.find(p => p.id === req.params.id);
  if (!pet) {
    return res.status(404).json({ error: 'Pet profile not found' });
  }
  res.json(pet);
});

// 4. Create new adoption listing
app.post('/api/pets', upload.single('photo'), (req, res) => {
  try {
    const body = req.body;
    const pets = getPets();

    let imageUrl = body.imageUrl || '';
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    if (!imageUrl) {
      const isDog = (body.species || '').toLowerCase().includes('dog');
      imageUrl = isDog
        ? 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=800&q=80'
        : 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80';
    }

    let lat = parseFloat(body.lat);
    let lng = parseFloat(body.lng);
    if (isNaN(lat) || isNaN(lng)) {
      lat = 37.7749 + (Math.random() - 0.5) * 0.05;
      lng = -122.4194 + (Math.random() - 0.5) * 0.05;
    }

    // Traits array
    let traits = [];
    if (body.traits) {
      traits = typeof body.traits === 'string' ? body.traits.split(',').map(t => t.trim()) : body.traits;
    } else {
      traits = ['Friendly', 'Loving', 'Adoptable'];
    }

    // Good with array
    let goodWith = [];
    if (body.goodWith) {
      goodWith = typeof body.goodWith === 'string' ? body.goodWith.split(',').map(g => g.trim()) : body.goodWith;
    } else {
      goodWith = ['Families', 'Adults'];
    }

    const newPet = {
      id: `pet-${Date.now()}-${uuidv4().slice(0, 6)}`,
      status: body.status || 'adoptable',
      name: body.name || 'Lovely Companion',
      species: body.species || 'Dog',
      breed: body.breed || 'Mixed Breed',
      gender: body.gender || 'Unknown',
      age: body.age || 'Young',
      size: body.size || 'Medium',
      primaryColor: body.primaryColor || 'Golden',
      secondaryColor: body.secondaryColor || '',
      adoptionFee: body.adoptionFee ? `$${body.adoptionFee.replace(/[^0-9.]/g, '')}` : '$100',
      vaccinated: body.vaccinated === 'true' || body.vaccinated === true,
      neutered: body.neutered === 'true' || body.neutered === true,
      microchipped: body.microchipped === 'true' || body.microchipped === true,
      goodWith,
      traits,
      date: body.date || new Date().toISOString().split('T')[0],
      location: body.location || 'Local Sanctuary, San Francisco',
      lat,
      lng,
      description: body.description || '',
      imageUrl,
      shelterName: body.shelterName || body.contactName || 'Community Rescue Network',
      contactPhone: body.contactPhone || '+1 (555) 000-0000',
      contactEmail: body.contactEmail || 'adoptions@rescue.org',
      createdAt: new Date().toISOString(),
      applications: []
    };

    pets.unshift(newPet);
    savePets(pets);

    res.status(201).json({ success: true, pet: newPet });
  } catch (err) {
    console.error('Error creating pet listing:', err);
    res.status(500).json({ error: 'Failed to create listing' });
  }
});

// 5. Submit adoption inquiry / application
app.post('/api/pets/:id/adopt', (req, res) => {
  const { applicantName, email, phone, homeType, hasYard, experience, message } = req.body;
  if (!applicantName || !phone) {
    return res.status(400).json({ error: 'Name and phone number are required' });
  }

  const pets = getPets();
  const index = pets.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Pet profile not found' });
  }

  const application = {
    id: `app-${Date.now()}`,
    date: new Date().toISOString(),
    applicantName: applicantName.trim(),
    email: email ? email.trim() : '',
    phone: phone.trim(),
    homeType: homeType || 'Apartment/House',
    hasYard: hasYard || 'No',
    experience: experience || 'Experienced',
    message: message ? message.trim() : ''
  };

  if (!pets[index].applications) {
    pets[index].applications = [];
  }
  pets[index].applications.unshift(application);
  
  // Optionally update status to pending review
  if (pets[index].status === 'adoptable') {
    pets[index].status = 'pending';
  }
  
  savePets(pets);

  res.status(201).json({ 
    success: true, 
    message: `Thank you, ${applicantName}! Your adoption application for ${pets[index].name} has been received. The rescue team will contact you shortly.`,
    pet: pets[index] 
  });
});

// 6. Update status
app.patch('/api/pets/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['adoptable', 'pending', 'adopted'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const pets = getPets();
  const index = pets.findIndex(p => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Pet not found' });
  }

  pets[index].status = status;
  savePets(pets);

  res.json({ success: true, pet: pets[index] });
});

// Fallback to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🐾 Pet Adoption Platform running on http://localhost:${PORT}`);
});
