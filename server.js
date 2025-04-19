const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const mime = require('mime-types');
const NodeCache = require('node-cache');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your-jwt-secret-key';
const dataDir = path.join(__dirname, "data");
const cache = new NodeCache({ stdTTL: 300 });

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.static("public"));

// Настройка Multer для загрузки нескольких файлов
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const gameDir = path.join(dataDir, 'games', req.body.gameId || Date.now().toString());
      if (!fs.existsSync(gameDir)) {
        fs.mkdirSync(gameDir, { recursive: true });
      }
      cb(null, gameDir);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['text/html', 'text/css', 'application/javascript', 'image/png', 'image/jpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый тип файла'));
    }
  }
});

// Настройка Multer для загрузки аватара
const avatarStorage = multer.memoryStorage();
const avatarUpload = multer({ 
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый тип файла'));
    }
  }
});

// Функции для работы с данными
const saveData = (filename, data) => {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const filePath = path.join(dataDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error(`Ошибка сохранения файла ${filename}:`, err.message);
    return false;
  }
};

const loadData = (filename, defaultValue = []) => {
  try {
    const filePath = path.join(dataDir, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`Файл ${filename} не найден. Создаем новый с данными по умолчанию.`);
      saveData(filename, defaultValue);
      return defaultValue;
    }
    const rawData = fs.readFileSync(filePath, "utf-8");
    const parsedData = JSON.parse(rawData);

    if (!Array.isArray(parsedData) && typeof parsedData !== "object") {
      throw new Error(`Некорректный формат данных в файле ${filename}`);
    }

    return parsedData;
  } catch (err) {
    console.error(`Ошибка загрузки файла ${filename}:`, err.message);
    return defaultValue;
  }
};

// Инициализация данных с проверкой
let users = loadData("users.json", [
  {
    id: "1",
    username: "admin",
    password: "$2b$10$7DiZlNi0I33ntPSBWwvCXuCPkMiT9vgr7hr7Nm/MhujppY0ZCBMkq", // 123456
    role: "admin",
    favorites: [],
    banned: false,
    bannedUntil: null,
    banReason: null,
    suspendedUntil: null
  },
]).map(user => ({
  ...user,
  favorites: user.favorites || [],
  banned: user.banned || false,
  bannedUntil: user.bannedUntil || null,
  banReason: user.banReason || null,
  suspendedUntil: user.suspendedUntil || null
}));

let games = loadData("games.json", []);

// Функция для обновления статуса всех пользователей на offline
const setAllUsersOffline = () => {
  users = users.map(user => ({ ...user, online: false }));
  saveData("users.json", users);
};

// Устанавливаем всех пользователей offline при запуске
setAllUsersOffline();

// Middleware для проверки токена
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.find(u => u.id.toString() === decoded.id.toString());
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
};

// Middleware для проверки ролей
const checkRole = (roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  next();
};

// Аутентификация
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }

    if (user.bannedUntil && new Date(user.bannedUntil) > new Date()) {
      return res.status(403).json({ 
        error: `Ваш аккаунт заблокирован до ${new Date(user.bannedUntil).toLocaleString()}`,
        banReason: user.banReason || 'Причина не указана'
      });
    }

    if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
      return res.status(403).json({ error: `Ваш аккаунт приостановлен до ${new Date(user.suspendedUntil).toLocaleString()}` });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    user.online = true;
    user.lastSeen = new Date().toISOString();
    saveData("users.json", users);

    res.json({ 
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        avatar: user.avatar || null
      },
      notifications: [] // Заглушка для уведомлений
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Регистрация
app.post("/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Необходимы имя пользователя и пароль' });
    }

    if (users.some(u => u.username === username)) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now().toString(),
      username,
      password: hashedPassword,
      role: role || 'user',
      online: true,
      avatar: null,
      favorites: [],
      banned: false,
      bannedUntil: null,
      banReason: null,
      suspendedUntil: null
    };

    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    users.push(newUser);
    saveData("users.json", users);

    res.json({ token, user: { id: newUser.id, username: newUser.username, role: newUser.role, avatar: null, favorites: [] } });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Выход
app.post("/logout", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.id;
        
        const user = users.find(u => u.id.toString() === userId.toString());
        if (user) {
          user.online = false;
          user.lastSeen = new Date().toISOString();
          saveData("users.json", users);
        }
      } catch (err) {
        console.error("Ошибка при выходе:", err);
      }
    }

    res.clearCookie('token');
    res.json({ success: true });
  } catch (err) {
    console.error("Ошибка выхода:", err);
    res.clearCookie('token');
    res.json({ success: true });
  }
});

// Загрузка аватара
app.post("/user/avatar", verifyToken, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Файл не загружен" });
    }

    const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const user = users.find(u => u.id === req.user.id);
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    user.avatar = base64Image;
    if (saveData("users.json", users)) {
      res.json({ success: true, avatar: base64Image });
    } else {
      throw new Error("Ошибка сохранения данных");
    }
  } catch (err) {
    console.error("Ошибка загрузки аватара:", err);
    res.status(500).json({ error: "Ошибка сервера: " + err.message });
  }
});

// Получение данных пользователя
app.get("/user-data", verifyToken, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Пользователь не авторизован' });
  }
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
    online: req.user.online,
    lastSeen: req.user.lastSeen || null,
    avatar: req.user.avatar || null
  });
});

// Получение списка избранных игр
app.get("/favorites", verifyToken, async (req, res) => {
  try {
    const user = users.find(u => u.id === req.user.id);
    if (!user || !user.favorites) {
      return res.json([]);
    }

    const favoriteGames = games.filter(game => user.favorites.includes(game.id));
    res.json(favoriteGames);
  } catch (err) {
    console.error("Ошибка получения избранных игр:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Добавление игры в избранное
app.post("/favorites/add/:gameId", verifyToken, async (req, res) => {
  try {
    const gameId = req.params.gameId;
    const game = games.find(g => g.id === gameId);
    if (!game) {
      console.log(`Игра с ID ${gameId} не найдена`);
      return res.status(404).json({ error: "Игра не найдена" });
    }

    const user = users.find(u => u.id === req.user.id);
    if (!user) {
      console.log(`Пользователь с ID ${req.user.id} не найден`);
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    if (user.favorites.includes(gameId)) {
      console.log(`Игра ${gameId} уже в избранном пользователя ${user.id}`);
      return res.status(400).json({ error: "Игра уже в избранном" });
    }

    user.favorites.push(gameId);
    console.log(`Добавлена игра ${gameId} в избранное пользователя ${user.id}`);
    if (saveData("users.json", users)) {
      res.json({ success: true });
    } else {
      throw new Error("Ошибка сохранения данных");
    }
  } catch (err) {
    console.error("Ошибка добавления в избранное:", err);
    res.status(500).json({ error: "Ошибка сервера: " + err.message });
  }
});

// Удаление игры из избранного
app.delete("/favorites/remove/:gameId", verifyToken, async (req, res) => {
  try {
    const gameId = req.params.gameId;
    const user = users.find(u => u.id === req.user.id);
    if (!user) {
      console.log(`Пользователь с ID ${req.user.id} не найден`);
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    user.favorites = user.favorites.filter(id => id !== gameId);
    console.log(`Удалена игра ${gameId} из избранного пользователя ${user.id}`);
    if (saveData("users.json", users)) {
      res.json({ success: true });
    } else {
      throw new Error("Ошибка сохранения данных");
    }
  } catch (err) {
    console.error("Ошибка удаления из избранного:", err);
    res.status(500).json({ error: "Ошибка сервера: " + err.message });
  }
});

// Получение списка игр
app.get("/games", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const { genre, sort } = req.query;

    let gamesList = loadData("games.json", []);
    if (!Array.isArray(gamesList)) gamesList = [];

    let filteredGames = [...gamesList];

    if (typeof genre === "string" && genre.trim() !== "") {
      const filterGenre = genre.trim().toLowerCase();
      filteredGames = filteredGames.filter(game => {
        const gameGenre = (game.genre || "").trim().toLowerCase();
        return gameGenre === filterGenre;
      });
    }

    if (typeof sort === "string" && sort.trim() !== "") {
      switch (sort.trim()) {
        case 'views':
          filteredGames.sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));
          break;
        case 'rating':
          filteredGames.sort((a, b) => {
            const avgA = Array.isArray(a.ratings) && a.ratings.length
              ? a.ratings.reduce((sum, r) => sum + Number(r.rating || 0), 0) / a.ratings.length : 0;
            const avgB = Array.isArray(b.ratings) && b.ratings.length
              ? b.ratings.reduce((sum, r) => sum + Number(r.rating || 0), 0) / b.ratings.length : 0;
            return avgB - avgA;
          });
          break;
        case 'date':
          filteredGames.sort((a, b) => {
            const dateA = new Date(a.uploadDate || a.id || 0).getTime();
            const dateB = new Date(b.uploadDate || a.id || 0).getTime();
            return dateB - dateA;
          });
          break;
      }
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id.toString() === decoded.id.toString());
        if (user) {
          filteredGames = filteredGames.map(game => ({
            ...game,
            isFavorite: user.favorites.includes(game.id),
            canEdit: user.role === 'admin' || game.author === user.username,
            hasRated: Array.isArray(game.ratings) && game.ratings.some(r => r.user === user.username)
          }));
        }
      } catch (err) {
        console.error('Ошибка проверки токена:', err);
      }
    }

    res.json(filteredGames);
  } catch (err) {
    console.error("Ошибка получения списка игр:", err);
    res.json([]);
  }
});

// Получение списка пользователей (админ)
app.get("/admin/users", verifyToken, checkRole(['admin']), (req, res) => {
  try {
    const usersList = users.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      online: user.online || false,
      lastSeen: user.lastSeen || null,
      avatar: user.avatar || null,
      bannedUntil: user.bannedUntil || null,
      banReason: user.banReason || null,
      suspendedUntil: user.suspendedUntil || null
    }));
    res.json(usersList);
  } catch (err) {
    console.error("Ошибка получения списка пользователей:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Бан пользователя
app.post("/admin/users/:username/ban", verifyToken, checkRole(['admin']), (req, res) => {
  try {
    const username = req.params.username;
    const { banDays, banReason } = req.body;
    const user = users.find(u => u.username === username);
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    if (user.username === req.user.username) {
      return res.status(400).json({ error: "Нельзя забанить самого себя" });
    }
    if (banDays && !isNaN(banDays) && banDays > 0) {
      const bannedUntil = new Date();
      bannedUntil.setDate(bannedUntil.getDate() + Number(banDays));
      user.bannedUntil = bannedUntil.toISOString();
      user.banned = true;
      user.banReason = banReason || 'Причина не указана';
    } else {
      return res.status(400).json({ error: "Укажите корректное количество дней для бана" });
    }
    user.online = false;
    saveData("users.json", users);
    res.json({ success: true });
  } catch (err) {
    console.error("Ошибка бана пользователя:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Приостановка пользователя
app.post("/admin/users/:username/suspend", verifyToken, checkRole(['admin']), (req, res) => {
  try {
    const username = req.params.username;
    const user = users.find(u => u.username === username);
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    if (user.username === req.user.username) {
      return res.status(400).json({ error: "Нельзя приостановить самого себя" });
    }
    const suspendDays = 7;
    const suspendedUntil = new Date();
    suspendedUntil.setDate(suspendedUntil.getDate() + suspendDays);
    user.suspendedUntil = suspendedUntil.toISOString();
    user.online = false;
    saveData("users.json", users);
    res.json({ success: true });
  } catch (err) {
    console.error("Ошибка приостановки пользователя:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Изменение роли пользователя
app.put("/admin/users/:username/role", verifyToken, checkRole(['admin']), (req, res) => {
  try {
    const username = req.params.username;
    const { role } = req.body;
    if (!['user', 'developer', 'admin'].includes(role)) {
      return res.status(400).json({ error: "Недопустимая роль" });
    }
    const user = users.find(u => u.username === username);
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    if (user.username === req.user.username) {
      return res.status(400).json({ error: "Нельзя изменить роль самому себе" });
    }
    user.role = role;
    saveData("users.json", users);
    res.json({ success: true });
  } catch (err) {
    console.error("Ошибка изменения роли:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Удаление пользователя
app.delete("/admin/users/:username", verifyToken, checkRole(['admin']), (req, res) => {
  try {
    const username = req.params.username;
    const user = users.find(u => u.username === username);
    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }
    if (user.username === req.user.username) {
      return res.status(400).json({ error: "Нельзя удалить самого себя" });
    }
    users = users.filter(u => u.username !== username);
    saveData("users.json", users);
    res.json({ success: true });
  } catch (err) {
    console.error("Ошибка удаления пользователя:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Получение отдельной игры
app.get("/games/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const game = games.find(g => g.id === req.params.id);

    if (!game) {
      return res.status(404).json({ error: "Игра не найдена" });
    }

    let responseGame = { ...game };

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id.toString() === decoded.id.toString());
        if (user) {
          responseGame.isFavorite = user.favorites.includes(game.id);
          responseGame.canEdit = user.role === 'admin' || game.author === user.username;
        }
      } catch (err) {
        console.error('Ошибка проверки токена:', err);
      }
    }

    res.json(responseGame);
  } catch (err) {
    console.error("Ошибка получения игры:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Получение списка файлов игры
app.get("/games/:id/files", verifyToken, (req, res) => {
  try {
    const game = games.find(g => g.id === req.params.id);
    if (!game) return res.status(404).json({ error: "Игра не найдена" });

    if (req.user.role !== 'admin' && game.author !== req.user.username) {
      return res.status(403).json({ error: "Нет прав доступа" });
    }

    const gameDir = path.join(dataDir, 'games', req.params.id);
    if (!fs.existsSync(gameDir)) {
      return res.json([]);
    }

    const getFiles = (dir, baseDir = '') => {
      const files = fs.readdirSync(dir);
      let result = [];

      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        const relativePath = path.join(baseDir, file);

        if (stat.isDirectory()) {
          result = result.concat(getFiles(filePath, relativePath));
        } else {
          result.push({
            path: relativePath,
            size: stat.size,
            modified: stat.mtime
          });
        }
      });

      return result;
    };

    const files = getFiles(gameDir);
    res.json(files);
  } catch (err) {
    console.error("Ошибка получения файлов:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Оценка игры
app.post("/games/:id/rate", verifyToken, (req, res) => {
  try {
    const game = games.find(g => g.id === req.params.id);
    if (!game) return res.status(404).json({ error: "Игра не найдена" });
    
    const { rating, comment } = req.body;
    const user = req.user.username;
    
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Рейтинг должен быть от 1 до 5" });
    }

    game.ratings = game.ratings || [];
    game.ratings.push({
      user,
      rating: Number(rating),
      comment: comment || "",
      date: new Date().toISOString()
    });

    game.views = (game.views || 0) + 1;

    if (saveData("games.json", games)) {
      cache.del("games");
      res.json({ success: true });
    } else {
      throw new Error("Ошибка сохранения");
    }
  } catch (err) {
    console.error("Ошибка сохранения оценки:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Обновление просмотров
app.post("/games/:id/view", (req, res) => {
  try {
    const game = games.find(g => g.id === req.params.id);
    if (!game) return res.status(404).json({ error: "Игра не найдена" });

    game.views = (game.views || 0) + 1;
    saveData("games.json", games);
    cache.del("games");
    res.json({ views: game.views });
  } catch (err) {
    console.error("Ошибка обновления просмотров:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Получение игр разработчика
app.get("/developer/games", verifyToken, (req, res) => {
  try {
    const userGames = games.filter(game => 
      game.author === req.user.username || req.user.role === 'admin'
    );
    res.json(userGames);
  } catch (err) {
    console.error("Ошибка получения игр разработчика:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Отдача файлов игр
app.get('/games/:gameId/*', (req, res) => {
  const gameId = req.params.gameId;
  const filePath = req.params[0];
  
  const gameDir = path.join(dataDir, 'games', gameId);
  const absPath = path.join(gameDir, filePath);
  
  if (!absPath.startsWith(gameDir)) {
    return res.status(403).send('Доступ запрещен');
  }
  
  fs.stat(absPath, (err, stat) => {
    if (!err && stat.isFile()) {
      const mimeType = mime.lookup(absPath) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      res.sendFile(absPath);
    } else {
      res.status(404).send('Файл не найден');
    }
  });
});

// Аналитика игры
app.get("/game-analytics/:id", verifyToken, (req, res) => {
  try {
    const game = games.find(g => g.id === req.params.id);
    if (!game) return res.status(404).json({ error: "Игра не найдена" });

    if (req.user.role !== 'admin' && game.author !== req.user.username) {
      return res.status(403).json({ error: "Нет прав доступа" });
    }

    const views = game.views || 0;
    const ratings = game.ratings || [];
    const averageRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
      : 0;

    res.json({
      views,
      ratings: ratings.length,
      averageRating: parseFloat(averageRating.toFixed(1))
    });
  } catch (err) {
    console.error("Ошибка получения аналитики:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Получение отзывов игры
app.get("/games/:id/reviews", verifyToken, (req, res) => {
  try {
    const game = games.find(g => g.id === req.params.id);
    if (!game) return res.status(404).json({ error: "Игра не найдена" });

    if (req.user.role !== 'admin' && game.author !== req.user.username) {
      return res.status(403).json({ error: "Нет прав доступа" });
    }

    const reviews = game.ratings || [];
    res.json(reviews);
  } catch (err) {
    console.error("Ошибка получения отзывов:", err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Загрузка обложки
const coverStorage = multer.memoryStorage();
const coverUpload = multer({ 
  storage: coverStorage,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

app.post("/games/:id/cover", verifyToken, coverUpload.single('cover'), async (req, res) => {
  try {
    const game = games.find(g => g.id === req.params.id);
    if (!game) {
      return res.status(404).json({ error: "Игра не найдена" });
    }

    if (req.user.role !== 'admin' && game.author !== req.user.username) {
      return res.status(403).json({ error: "Нет прав доступа" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Файл не загружен" });
    }

    const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    game.cover = base64Image;
    
    if (saveData("games.json", games)) {
      cache.del("games");
      res.json({ 
        success: true, 
        cover: base64Image 
      });
    } else {
      throw new Error("Ошибка сохранения данных");
    }
  } catch (err) {
    console.error("Ошибка загрузки обложки:", err);
    res.status(500).json({ error: "Ошибка сервера: " + err.message });
  }
});

// Загрузка файлов игры
app.post('/upload-game-files', verifyToken, upload.array('gameFiles', 50), (req, res) => {
  try {
    const gameId = req.body.gameId || Date.now().toString();
    const gameDir = path.join(dataDir, 'games', gameId);
    
    const files = req.files.map(file => file.path);
    
    const newGame = {
      id: gameId,
      title: req.body.title,
      description: req.body.description,
      genre: req.body.genre,
      author: req.user.username,
      files: files,
      views: 0,
      ratings: []
    };
    
    games.push(newGame);
    saveData('games.json', games);
    res.json({ success: true, game: newGame });
  } catch (err) {
    console.error('Ошибка загрузки файлов:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Редактирование игры
app.put("/games/:id", verifyToken, coverUpload.single('cover'), async (req, res) => {
  try {
    const { id } = req.params;
    const gameIndex = games.findIndex(g => g.id === id);
    
    if (gameIndex === -1) {
      return res.status(404).json({ error: "Игра не найдена" });
    }

    if (req.user.role !== 'admin' && games[gameIndex].author !== req.user.username) {
      return res.status(403).json({ error: "Нет прав доступа" });
    }

    const updatedGame = {
      ...games[gameIndex],
      ...req.body,
      id
    };

    if (req.file) {
      updatedGame.cover = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    games[gameIndex] = updatedGame;

    if (saveData("games.json", games)) {
      cache.del("games");
      res.json({ 
        success: true, 
        game: updatedGame 
      });
    } else {
      throw new Error("Ошибка сохранения данных");
    }
  } catch (err) {
    console.error("Ошибка обновления игры:", err);
    res.status(500).json({ error: "Ошибка сервера: " + err.message });
  }
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error("Ошибка сервера:", err.message);
  res.status(500).json({ error: "Произошла ошибка на сервере. Попробуйте позже." });
});

// Обработка ненайденных маршрутов
app.use((req, res) => {
  res.status(404).json({ error: "Маршрут не найден." });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
  console.log(`Директория данных: ${dataDir}`);
});