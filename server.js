const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const admZip = require("adm-zip");
const mime = require('mime-types');
const NodeCache = require('node-cache');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your-jwt-secret-key';
const dataDir = path.join(__dirname, "data");
const cache = new NodeCache({ stdTTL: 300 });

app.use(cookieParser());
app.use(express.json());
app.use(express.static("public"));

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

let users = loadData("users.json", [
  {
    id: "1",
    username: "admin",
    password: "$2b$10$7DiZlNi0I33ntPSBWwvCXuCPkMiT9vgr7hr7Nm/MhujppY0ZCBMkq",
    role: "admin",
    favorites: [] // Добавляем поле для избранного
  },
]);

let games = loadData("games.json", []);

const setAllUsersOffline = () => {
  users = users.map(user => ({ ...user, online: false }));
  saveData("users.json", users);
};

const restoreOnlineStatus = () => {
  const tokens = loadData("tokens.json", []);
  users = users.map(user => {
    const token = tokens.find(t => t.userId === user.id);
    if (token) {
      try {
        jwt.verify(token.token, JWT_SECRET);
        return { ...user, online: true };
      } catch {
        return { ...user, online: false };
      }
    }
    return { ...user, online: false };
  });
  saveData("users.json", users);
};

setAllUsersOffline();
restoreOnlineStatus();

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

const checkRole = (roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  next();
};

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    user.online = true;
    saveData("users.json", users);

    const tokens = loadData("tokens.json", []);
    tokens.push({ userId: user.id, token });
    saveData("tokens.json", tokens);

    res.json({ 
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

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
      online: false,
      favorites: [] // Инициализируем избранное
    };

    users.push(newUser);

    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    saveData("users.json", users);

    res.json({ token, user: { id: newUser.id, username: newUser.username, role: newUser.role } });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post("/logout", (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
      let tokens = loadData("tokens.json", []);
      const userToken = tokens.find(t => t.token === token);
      
      if (userToken) {
        const user = users.find(u => u.id.toString() === userToken.userId.toString());
        if (user) {
          user.online = false;
          saveData("users.json", users);
        }
        
        tokens = tokens.filter(t => t.token !== token);
        saveData("tokens.json", tokens);
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

app.get("/user-data", verifyToken, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Пользователь не авторизован' });
  }
  res.json(req.user);
});

// Новый маршрут для получения избранных игр
app.get("/favorites", verifyToken, (req, res) => {
  try {
    const userFavorites = req.user.favorites || [];
    const favoriteGames = games.filter(game => userFavorites.includes(game.id));
    res.json(favoriteGames);
  } catch (err) {
    console.error("Ошибка получения избранного:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Новый маршрут для добавления игры в избранное
app.post("/favorites/add/:gameId", verifyToken, (req, res) => {
  try {
    const gameId = req.params.gameId;
    const game = games.find(g => g.id === gameId);
    if (!game) {
      return res.status(404).json({ error: "Игра не найдена" });
    }

    const userIndex = users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    if (!users[userIndex].favorites) {
      users[userIndex].favorites = [];
    }

    if (!users[userIndex].favorites.includes(gameId)) {
      users[userIndex].favorites.push(gameId);
      saveData("users.json", users);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Ошибка добавления в избранное:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Новый маршрут для удаления игры из избранного
app.delete("/favorites/remove/:gameId", verifyToken, (req, res) => {
  try {
    const gameId = req.params.gameId;
    const userIndex = users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    if (users[userIndex].favorites) {
      users[userIndex].favorites = users[userIndex].favorites.filter(id => id !== gameId);
      saveData("users.json", users);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Ошибка удаления из избранного:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

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
            const dateB = new Date(b.uploadDate || b.id || 0).getTime();
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
            canEdit: user.role === 'admin' || game.author === user.username,
            hasRated: Array.isArray(game.ratings) && game.ratings.some(r => r.user === user.username),
            isFavorite: user.favorites && user.favorites.includes(game.id)
          }));
        }
      } catch (err) {
        // Игнорируем ошибку токена
      }
    }

    res.json(filteredGames);
  } catch (err) {
    console.error("Ошибка получения списка игр:", err);
    res.json([]);
  }
});

app.get("/admin/users", verifyToken, checkRole(['admin']), (req, res) => {
  try {
    const usersList = users.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      online: user.online || false,
      lastSeen: user.lastSeen || null
    }));
    res.json(usersList);
  } catch (err) {
    console.error("Ошибка получения списка пользователей:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.get("/games/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const game = games.find(g => g.id === req.params.id);

    if (!game) {
      return res.status(404).json({ error: "Игра не найдена" });
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id.toString() === decoded.id.toString());
        if (user) {
          game.canEdit = user.role === 'admin' || game.author === user.username;
          game.isFavorite = user.favorites && user.favorites.includes(game.id);
        }
      } catch (err) {
        console.error('Ошибка проверки токена:', err);
      }
    }

    res.json(game);
  } catch (err) {
    console.error("Ошибка получения игры:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

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

app.get(/^\/games\/([^\/]+)\/(.+)$/, (req, res) => {
  const gameId = req.params[0];
  const filePath = req.params[1];
  
  const gameDir = path.resolve(__dirname, 'data', 'games', gameId);
  const absPath = path.resolve(gameDir, filePath);

  if (!absPath.startsWith(gameDir + path.sep)) {
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

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

app.post("/games/:id/cover", verifyToken, upload.single('cover'), async (req, res) => {
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

app.post("/games", verifyToken, (req, res) => {
  try {
    const { title, description, genre, author, cover } = req.body;

    if (!title || !description || !genre || !author) {
      return res.status(400).json({ error: "Все поля обязательны" });
    }

    const newGame = {
      id: Date.now().toString(),
      title,
      description,
      genre,
      author,
      cover: cover || "",
      views: 0,
      ratings: []
    };

    games.push(newGame);

    saveData("games.json", games);
    cache.del("games");
    res.json({ success: true, game: newGame });
  } catch (err) {
    console.error("Ошибка добавления игры:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.put("/games/:id", verifyToken, upload.single('cover'), async (req, res) => {
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

app.use((err, req, res, next) => {
  console.error("Ошибка сервера:", err.message);
  res.status(500).json({ error: "Произошла ошибка на сервере. Попробуйте позже." });
});

app.use((req, res) => {
  res.status(404).json({ error: "Маршрут не найден." });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
  console.log(`Директория данных: ${dataDir}`);
});