const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Включение CORS для Express
app.use(cors());
app.use(express.json());

// Хранилище данных (в реальном приложении нужно использовать базу данных)
let users = {};
let onlineUsers = {};

// Маршрут для проверки здоровья сервера
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Сервер демо-банка работает', usersCount: Object.keys(onlineUsers).length });
});

// Маршрут для регистрации
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
  }
  
  if (users[username]) {
    return res.status(409).json({ error: 'Пользователь с таким именем уже существует' });
  }
  
  // Создаем нового пользователя
  users[username] = {
    username,
    password, // В реальном приложении пароль должен быть захеширован!
    balance: 25000,
    transactions: [
      {
        id: 1,
        name: "Начальный бонус",
        date: new Date().toISOString(),
        amount: 25000,
        type: "incoming"
      }
    ],
    clickerData: {
      totalClicks: 0,
      totalEarned: 0,
      incomePerClick: 10000,
      upgrades: [
        {
          id: 1,
          name: "Улучшенная мышь",
          description: "Увеличивает доход за клик на 5 000 ₽",
          price: 50000,
          incomeIncrease: 5000,
          purchased: false
        },
        {
          id: 2,
          name: "Золотая кнопка",
          description: "Увеличивает доход за клик на 15 000 ₽",
          price: 150000,
          incomeIncrease: 15000,
          purchased: false
        },
        {
          id: 3,
          name: "Автокликер",
          description: "Увеличивает доход за клик на 30 000 ₽",
          price: 300000,
          incomeIncrease: 30000,
          purchased: false
        },
        {
          id: 4,
          name: "Банковский бот",
          description: "Увеличивает доход за клик на 50 000 ₽",
          price: 500000,
          incomeIncrease: 50000,
          purchased: false
        },
        {
          id: 5,
          name: "ИИ-помощник",
          description: "Увеличивает доход за клик на 100 000 ₽",
          price: 1000000,
          incomeIncrease: 100000,
          purchased: false
        }
      ]
    }
  };
  
  res.json({ 
    success: true, 
    message: 'Регистрация успешна',
    user: {
      username,
      balance: users[username].balance
    }
  });
});

// Маршрут для входа
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
  }
  
  const user = users[username];
  
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
  }
  
  res.json({ 
    success: true, 
    message: 'Вход выполнен успешно',
    user: {
      username,
      balance: user.balance,
      transactions: user.transactions,
      clickerData: user.clickerData
    }
  });
});

// Маршрут для выполнения перевода
app.post('/transfer', (req, res) => {
  const { from, to, amount } = req.body;
  
  if (!from || !to || !amount) {
    return res.status(400).json({ error: 'Отправитель, получатель и сумма обязательны' });
  }
  
  const sender = users[from];
  const receiver = users[to];
  
  if (!sender) {
    return res.status(404).json({ error: 'Отправитель не найден' });
  }
  
  if (!receiver) {
    return res.status(404).json({ error: 'Получатель не найден' });
  }
  
  if (sender.balance < amount) {
    return res.status(400).json({ error: 'Недостаточно средств' });
  }
  
  if (amount <= 0) {
    return res.status(400).json({ error: 'Сумма должна быть положительной' });
  }
  
  // Выполняем перевод
  sender.balance -= amount;
  receiver.balance += amount;
  
  // Добавляем транзакции
  const senderTransaction = {
    id: sender.transactions.length + 1,
    name: `Перевод: ${to}`,
    date: new Date().toISOString(),
    amount: -amount,
    type: "outgoing"
  };
  
  const receiverTransaction = {
    id: receiver.transactions.length + 1,
    name: `Перевод от: ${from}`,
    date: new Date().toISOString(),
    amount: amount,
    type: "incoming"
  };
  
  sender.transactions.push(senderTransaction);
  receiver.transactions.push(receiverTransaction);
  
  // Уведомляем онлайн пользователей об обновлении
  if (onlineUsers[from]) {
    io.to(onlineUsers[from].socketId).emit('balanceUpdate', { balance: sender.balance });
    io.to(onlineUsers[from].socketId).emit('newTransaction', senderTransaction);
  }
  
  if (onlineUsers[to]) {
    io.to(onlineUsers[to].socketId).emit('balanceUpdate', { balance: receiver.balance });
    io.to(onlineUsers[to].socketId).emit('newTransaction', receiverTransaction);
  }
  
  // Отправляем уведомление всем о переводе
  io.emit('transferNotification', {
    from,
    to,
    amount,
    timestamp: new Date().toISOString()
  });
  
  res.json({ 
    success: true, 
    message: 'Перевод выполнен успешно',
    senderBalance: sender.balance
  });
});

// Маршрут для получения списка пользователей
app.get('/users', (req, res) => {
  const usersList = Object.keys(users).map(username => ({
    username,
    balance: users[username].balance,
    online: !!onlineUsers[username]
  }));
  
  res.json({ users: usersList });
});

// WebSocket соединения
io.on('connection', (socket) => {
  console.log('Новое подключение:', socket.id);
  
  // Обработчик входа пользователя
  socket.on('userLogin', (userData) => {
    const { username } = userData;
    
    // Сохраняем информацию о подключенном пользователе
    onlineUsers[username] = {
      socketId: socket.id,
      username,
      connectedAt: new Date()
    };
    
    // Отправляем информацию о входе всем пользователям
    io.emit('userStatusChange', {
      username,
      online: true,
      onlineUsers: Object.keys(onlineUsers).length
    });
    
    console.log(`Пользователь ${username} вошел в систему`);
  });
  
  // Обработчик выхода пользователя
  socket.on('userLogout', (username) => {
    if (onlineUsers[username]) {
      delete onlineUsers[username];
      
      // Отправляем информацию о выходе всем пользователям
      io.emit('userStatusChange', {
        username,
        online: false,
        onlineUsers: Object.keys(onlineUsers).length
      });
      
      console.log(`Пользователь ${username} вышел из системы`);
    }
  });
  
  // Обработчик обновления кликера
  socket.on('clickerUpdate', (data) => {
    const { username, clickerData } = data;
    
    if (users[username]) {
      users[username].clickerData = clickerData;
      console.log(`Обновлены данные кликера для пользователя ${username}`);
    }
  });
  
  // Обработчик обновления баланса (кликер)
  socket.on('balanceUpdateFromClicker', (data) => {
    const { username, amount } = data;
    
    if (users[username]) {
      users[username].balance += amount;
      
      // Добавляем транзакцию
      const transaction = {
        id: users[username].transactions.length + 1,
        name: "Кликер: заработок",
        date: new Date().toISOString(),
        amount: amount,
        type: "incoming"
      };
      
      users[username].transactions.push(transaction);
      
      // Отправляем обновление пользователю
      if (onlineUsers[username]) {
        io.to(onlineUsers[username].socketId).emit('balanceUpdate', { balance: users[username].balance });
        io.to(onlineUsers[username].socketId).emit('newTransaction', transaction);
      }
      
      console.log(`Баланс пользователя ${username} обновлен: +${amount}`);
    }
  });
  
  // Обработчик отключения
  socket.on('disconnect', () => {
    // Находим пользователя по socket.id и удаляем из онлайн пользователей
    for (const username in onlineUsers) {
      if (onlineUsers[username].socketId === socket.id) {
        delete onlineUsers[username];
        
        // Отправляем информацию о выходе всем пользователям
        io.emit('userStatusChange', {
          username,
          online: false,
          onlineUsers: Object.keys(onlineUsers).length
        });
        
        console.log(`Пользователь ${username} отключился`);
        break;
      }
    }
    
    console.log('Пользователь отключился:', socket.id);
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер демо-банка запущен на порту ${PORT}`);
  console.log(`Доступен по адресу: http://localhost:${PORT}`);
  console.log(`Для подключения клиентов используйте этот адрес`);
});