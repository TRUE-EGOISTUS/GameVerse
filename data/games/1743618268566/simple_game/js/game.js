let score = 0;
let multiplier = 1;
let autoClickerCount = 0;
let comboCount = 0;
let lastClickTime = 0;
let achievements = {
    clicks: { count: 0, milestones: [100, 1000, 10000], unlocked: [] },
    criticals: { count: 0, milestones: [10, 50, 100], unlocked: [] },
    combos: { count: 0, milestones: [5, 15, 30], unlocked: [] }
};

let playerLevel = 1;
let experience = 0;
let experienceToNextLevel = 100;
let comboMultiplier = 0.1;
let critChance = 0.1;
let critMultiplier = 2;

const clickBtn = document.getElementById('clickBtn');
const scoreElement = document.getElementById('score');
const multiplierElement = document.getElementById('multiplier');
const buyMultiplierBtn = document.getElementById('buyMultiplier');
const buyAutoClickerBtn = document.getElementById('buyAutoClicker');

const themes = {
    default: { id: 'defaultTheme', price: 0, owned: true },
    cyberpunk: { id: 'cyberpunkTheme', price: 0, owned: true },
    matrix: { id: 'matrixTheme', price: 0, owned: true },
    synthwave: { id: 'synthwaveTheme', price: 0, owned: true },
    void: { id: 'voidTheme', price: 0, owned: true },
    quantum: { id: 'quantumTheme', price: 0, owned: true },
    steampunk: { id: 'steampunkTheme', price: 0, owned: true },
    cosmic: { id: 'cosmicTheme', price: 0, owned: true },
    fire: { id: 'fireTheme', price: 0, owned: true },
    nature: { id: 'natureTheme', price: 0, owned: true },
    vaporwave: { id: 'vaporwaveTheme', price: 0, owned: true },
    retroArcade: { id: 'retroArcadeTheme', price: 0, owned: true },
    neonTokyo: { id: 'neonTokyoTheme', price: 0, owned: true },
    glitch: { id: 'glitchTheme', price: 0, owned: true },
    bioTech: { id: 'bioTechTheme', price: 0, owned: true },
    crystal: { id: 'crystalTheme', price: 0, owned: true },
    ancient: { id: 'ancientTheme', price: 0, owned: true },
    digitalRain: { id: 'digitalRainTheme', price: 0, owned: true },
    hologram: { id: 'hologramTheme', price: 0, owned: true },
    electric: { id: 'electricTheme', price: 0, owned: true },
    desert: { id: 'desertTheme', price: 0, owned: true },
    jungle: { id: 'jungleTheme', price: 0, owned: true },
    volcanic: { id: 'volcanicTheme', price: 0, owned: true },
    arctic: { id: 'arcticTheme', price: 0, owned: true },
    medieval: { id: 'medievalTheme', price: 0, owned: true },
    neonRetro: { id: 'neonRetroTheme', price: 0, owned: true },
    deepOcean: { id: 'deepOceanTheme', price: 0, owned: true },
    cosmicHorror: { id: 'cosmicHorrorTheme', price: 0, owned: true }
};

function updateDisplay() {
    scoreElement.textContent = Math.floor(score);
    multiplierElement.textContent = 'x' + multiplier;
    document.getElementById('level').textContent = `Уровень ${playerLevel}`;
    updateExpBar();
    updateAllThemeButtons();
}

function applyTheme(themeName) {
    // Удаляем все классы тем
    const themeClasses = Object.keys(themes).map(name => `theme-${name}`);
    document.body.classList.remove(...themeClasses);
    document.querySelectorAll('*').forEach(el => el.classList.remove(...themeClasses));

    // Применяем новую тему
    document.body.classList.add(`theme-${themeName}`);
    document.querySelectorAll('*').forEach(el => el.classList.add(`theme-${themeName}`));

    // Обновляем кнопки
    Object.entries(themes).forEach(([name, theme]) => {
        const btn = document.getElementById(theme.id);
        if (btn) {
            btn.className = `theme-btn theme-${name}`;
            if (theme.owned) btn.classList.add('owned');
            if (name === themeName && theme.owned) {
                btn.textContent = 'Активно';
                btn.classList.add('active');
            } else if (theme.owned) {
                btn.textContent = 'Выбрать';
            } else {
                btn.textContent = `${getThemeName(name)} (${theme.price})`;
            }
            btn.disabled = !theme.owned && score < theme.price;
        }
    });

    // Сохраняем активную тему
    localStorage.setItem('activeTheme', themeName);
    createThemeSpecificEffects(themeName);
}

function createThemeSpecificEffects(themeName) {
    const themeEffects = document.querySelector('.theme-effects');
    themeEffects.innerHTML = '';

    switch (themeName) {
        case 'matrix':
            createMatrixRain();
            break;
        case 'fire':
            createFireParticles();
            break;
        case 'nature':
            createNatureEffects();
            break;
        // Добавляем другие специфичные эффекты для тем
    }
}

function createMatrixRain() {
    const canvas = document.createElement('canvas');
    canvas.className = 'matrix-rain';
    document.querySelector('.theme-effects').appendChild(canvas);
    // Реализация эффекта цифрового дождя
}

function createFireParticles() {
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'fire-particles';
    document.querySelector('.theme-effects').appendChild(particlesContainer);
    // Реализация огненных частиц
}

function createNatureEffects() {
    const leavesContainer = document.createElement('div');
    leavesContainer.className = 'floating-leaves';
    document.querySelector('.theme-effects').appendChild(leavesContainer);
    // Реализация плавающих листьев
}

function initThemes() {
    Object.entries(themes).forEach(([name, theme]) => {
        const btn = document.getElementById(theme.id);
        if (!btn) return;

        btn.addEventListener('click', () => {
            if (!theme.owned && score >= theme.price) {
                score -= theme.price;
                theme.owned = true;
                scoreElement.textContent = Math.floor(score);
                btn.classList.add('owned');
                applyTheme(name);
                showAchievement(`Тема "${getThemeName(name)}" разблокирована!`);
                saveGame();
            } else if (theme.owned) {
                applyTheme(name);
            }
        });
    });

    // Загружаем сохраненную тему при старте
    const activeTheme = localStorage.getItem('activeTheme');
    if (activeTheme && themes[activeTheme]?.owned) {
        applyTheme(activeTheme);
    }
}

function updateThemeButton(btn, name, theme) {
    const activeTheme = localStorage.getItem('activeTheme');
    btn.disabled = !theme.owned && score < theme.price;
    
    // Сбрасываем классы
    btn.className = 'theme-btn';
    if (theme.owned) btn.classList.add('owned');
    if (name === activeTheme) btn.classList.add('active');
    
    // Обновляем текст
    if (theme.owned) {
        btn.textContent = name === activeTheme ? 'Активно' : 'Выбрать';
    } else {
        btn.textContent = `${getThemeName(name)} (${theme.price})`;
    }
}

function updateAllThemeButtons() {
    Object.entries(themes).forEach(([name, theme]) => {
        const btn = document.getElementById(theme.id);
        if (btn) {
            updateThemeButton(btn, name, theme);
        }
    });
}

function getThemeName(themeName) {
    const themeNames = {
        default: 'Базовая',
        cyberpunk: 'Киберпанк',
        matrix: 'Матрица',
        synthwave: 'Синтвейв',
        hacker: 'Хакер',
        space: 'Космос',
        void: 'Пустота',
        nature: 'Природа',
        fire: 'Огонь',
        quantum: 'Квантум',
        steampunk: 'Стимпанк',
        cosmic: 'Космический',
        vaporwave: 'Вейпорвейв',
        retroArcade: 'Ретро-Аркада',
        neonTokyo: 'Неон-Токио',
        glitch: 'Глитч',
        bioTech: 'Био-Тех',
        crystal: 'Кристалл',
        ancient: 'Древний',
        digitalRain: 'Цифровой Дождь',
        hologram: 'Голограмма',
        electric: 'Электрический',
        desert: 'Пустыня',
        jungle: 'Джунгли',
        volcanic: 'Вулкан',
        arctic: 'Арктика',
        medieval: 'Средневековье',
        neonRetro: 'Неон Ретро',
        deepOcean: 'Глубины Океана',
        cosmicHorror: 'Космический Ужас'
    };
    return themeNames[themeName] || themeName;
}

function updateScore(amount, isCritical = false) {
    const now = Date.now();
    const timeDiff = now - lastClickTime;
    
    // Combo system
    if (timeDiff < 500) { // 500ms window for combos
        comboCount++;
        document.getElementById('combo').textContent = `Комбо: x${comboCount}`;
        amount *= (1 + comboCount * comboMultiplier); // Updated combo multiplier
    } else {
        comboCount = 0;
        document.getElementById('combo').textContent = '';
    }
    lastClickTime = now;

    // Critical hit system
    if (isCritical) {
        amount *= critMultiplier; // Updated crit multiplier
        achievements.criticals.count++;
        showFloatingText('КРИТ!', '#ff0000');
    }

    score += amount * multiplier;
    scoreElement.textContent = Math.floor(score);
    achievements.clicks.count++;
    checkAchievements();
    
    // Обновляем состояние кнопок тем
    updateAllThemeButtons();

    // Add experience
    gainExperience(amount);
    saveGame();
}

function gainExperience(amount) {
    experience += amount;
    while (experience >= experienceToNextLevel) {
        levelUp();
    }
    updateExpBar();
}

function levelUp() {
    playerLevel++;
    experience -= experienceToNextLevel;
    experienceToNextLevel = Math.floor(experienceToNextLevel * 1.5);
    multiplier += 0.5;
    document.getElementById('level').textContent = `Уровень ${playerLevel}`;
    showAchievement(`Новый уровень: ${playerLevel}!`);
}

function updateExpBar() {
    const expElement = document.getElementById('exp');
    const percentage = (experience / experienceToNextLevel) * 100;
    expElement.textContent = `Опыт: ${Math.floor(experience)} / ${experienceToNextLevel}`;
    expElement.style.setProperty('--exp-width', `${percentage}%`);
}

function saveGame() {
    const gameState = {
        score, multiplier, autoClickerCount, playerLevel,
        experience, themes, achievements
    };
    localStorage.setItem('clickerGameState', JSON.stringify(gameState));
}

function loadGame() {
    const savedState = localStorage.getItem('clickerGameState');
    if (savedState) {
        const state = JSON.parse(savedState);
        score = state.score || 0;
        multiplier = state.multiplier || 1;
        autoClickerCount = state.autoClickerCount || 0;
        playerLevel = state.playerLevel || 1;
        experience = state.experience || 0;
        
        if (state.themes) {
            Object.entries(state.themes).forEach(([name, theme]) => {
                if (themes[name]) {
                    themes[name].owned = theme.owned;
                }
            });
        }
        
        achievements = state.achievements || achievements;
        
        // Принудительно обновляем отображение после загрузки
        updateDisplay();
        const activeTheme = localStorage.getItem('activeTheme');
        if (activeTheme && themes[activeTheme]?.owned) {
            applyTheme(activeTheme);
        }
    }
}

function checkAchievements() {
    for (const [type, data] of Object.entries(achievements)) {
        for (const milestone of data.milestones) {
            if (data.count >= milestone && !data.unlocked.includes(milestone)) {
                data.unlocked.push(milestone);
                showAchievement(`${type} ${milestone}`);
            }
        }
    }
}

function showFloatingText(text, color) {
    const float = document.createElement('div');
    float.className = 'floating-text';
    float.textContent = text;
    float.style.color = color;
    document.body.appendChild(float);
    setTimeout(() => float.remove(), 1000);
}

function showAchievement(text) {
    const achievement = document.createElement('div');
    achievement.className = 'achievement';
    achievement.textContent = `Достижение получено: ${text}`;
    document.body.appendChild(achievement);
    setTimeout(() => achievement.remove(), 3000);
}

function createParticle(x, y) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    // Добавляем специфичные для темы классы
    const activeTheme = localStorage.getItem('activeTheme');
    if (activeTheme) {
        particle.classList.add(`${activeTheme}-particle`);
    }
    
    particle.textContent = '+' + multiplier;
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    particle.style.setProperty('--x', (Math.random() * 100 - 50) + 'px');
    particle.style.setProperty('--y', (Math.random() * -100 - 50) + 'px');
    
    document.getElementById('particles').appendChild(particle);
    setTimeout(() => particle.remove(), 1000);
}

// Обработчики событий для эффектов при нажатии
function handleClickEffects(e) {
    const activeTheme = localStorage.getItem('activeTheme');
    createParticle(e.clientX, e.clientY);
    
    switch(activeTheme) {
        case 'cyberpunk':
            createCyberpunkRipple(e.clientX, e.clientY);
            break;
        case 'void':
            createVoidPulse(e.clientX, e.clientY);
            break;
        // Добавляем другие эффекты для тем
    }
}

function simulateClick(x = window.innerWidth / 2, y = window.innerHeight / 2) {
    const isCritical = Math.random() < critChance; // Updated crit chance
    updateScore(1, isCritical);
    createParticle(x, y);
    clickBtn.style.transform = 'scale(0.95)';
    setTimeout(() => clickBtn.style.transform = 'scale(1)', 100);
}

function resetGame() {
    // Сброс всех переменных
    score = 0;
    multiplier = 1;
    autoClickerCount = 0;
    comboCount = 0;
    playerLevel = 1;
    experience = 0;
    experienceToNextLevel = 100;
    comboMultiplier = 0.1;
    critChance = 0.1;
    critMultiplier = 2;

    // Сброс достижений
    achievements = {
        clicks: { count: 0, milestones: [100, 1000, 10000], unlocked: [] },
        criticals: { count: 0, milestones: [10, 50, 100], unlocked: [] },
        combos: { count: 0, milestones: [5, 15, 30], unlocked: [] }
    };

    // Сброс владения темами
    Object.values(themes).forEach(theme => {
        theme.owned = false;
    });

    // Удаление всех сохранений
    localStorage.removeItem('clickerGameState');
    localStorage.removeItem('activeTheme');

    // Обновление отображения
    updateDisplay();
    updateAllThemeButtons();

    // Удаляем все классы тем
    const themeClasses = Object.keys(themes).map(name => `theme-${name}`);
    document.body.classList.remove(...themeClasses);
}

// Добавляем константы для горячих клавиш
const HOTKEYS = {
    CLICK: 'Space',
    MULTIPLIER: 'Digit1',
    AUTOCLICKER: 'Digit2',
    COMBO_BOOSTER: 'Digit3',
    CRIT_CHANCE: 'Digit4',
    THEME_START: 'KeyQ'  // Первая клавиша для тем
};

// Обновляем обработчик клавиатуры
document.addEventListener('keydown', (e) => {
    if (e.repeat) return; // Игнорируем удержание клавиши

    switch (e.code) {
        case HOTKEYS.CLICK:
            e.preventDefault();
            simulateClick();
            document.querySelector('.keyboard-hint').classList.add('active');
            break;
            
        case HOTKEYS.MULTIPLIER:
            if (!buyMultiplierBtn.disabled) {
                buyMultiplierBtn.click();
                buyMultiplierBtn.classList.add('active');
            }
            break;
            
        case HOTKEYS.AUTOCLICKER:
            if (!buyAutoClickerBtn.disabled) {
                buyAutoClickerBtn.click();
                buyAutoClickerBtn.classList.add('active');
            }
            break;
            
        case HOTKEYS.COMBO_BOOSTER:
            const comboBtn = document.getElementById('buyComboBooster');
            if (comboBtn && !comboBtn.disabled) {
                comboBtn.click();
                comboBtn.classList.add('active');
            }
            break;
            
        case HOTKEYS.CRIT_CHANCE:
            const critBtn = document.getElementById('buyCritChance');
            if (critBtn && !critBtn.disabled) {
                critBtn.click();
                critBtn.classList.add('active');
            }
            break;
            
        default:
            // Обработка клавиш для тем (Q-P, A-L)
            const themeKeys = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 
                             'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'];
            const keyIndex = themeKeys.indexOf(e.code);
            if (keyIndex !== -1) {
                const themeButtons = document.querySelectorAll('.theme-btn');
                if (themeButtons[keyIndex] && !themeButtons[keyIndex].disabled) {
                    themeButtons[keyIndex].click();
                    themeButtons[keyIndex].classList.add('active');
                }
            }
    }
});

// Обработчик отпускания клавиш
document.addEventListener('keyup', (e) => {
    const button = document.querySelector(`button[data-key="${e.code}"]`);
    if (button) {
        button.classList.remove('active');
    }
    if (e.code === HOTKEYS.CLICK) {
        document.querySelector('.keyboard-hint').classList.remove('active');
    }
});

// Обновляем подсказки для кнопок
function updateButtonHints() {
    document.querySelectorAll('button[data-key]').forEach(button => {
        const keyHint = document.createElement('span');
        keyHint.className = 'key-hint';
        keyHint.textContent = `[${button.getAttribute('data-key').replace('Key', '')}]`;
        button.appendChild(keyHint);
    });
}

resetGame();

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        simulateClick();
        document.querySelector('.keyboard-hint').classList.add('active');
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        document.querySelector('.keyboard-hint').classList.remove('active');
    }
});

clickBtn.addEventListener('click', (e) => {
    simulateClick(e.clientX, e.clientY);
    handleClickEffects(e);
});

buyMultiplierBtn.addEventListener('click', () => {
    const cost = 100 * multiplier;
    if (score >= cost) {
        score -= cost;
        multiplier++;
        multiplierElement.textContent = 'x' + multiplier;
        scoreElement.textContent = Math.floor(score);
        buyMultiplierBtn.textContent = `Купить множитель (${100 * multiplier})`;
    }
});

buyAutoClickerBtn.addEventListener('click', () => {
    const cost = 500;
    if (score >= cost) {
        score -= cost;
        autoClickerCount++;
        scoreElement.textContent = Math.floor(score);
    }
});

document.getElementById('buyComboBooster').addEventListener('click', () => {
    const cost = 750;
    if (score >= cost) {
        score -= cost;
        comboMultiplier += 0.05;
        scoreElement.textContent = Math.floor(score);
    }
});

document.getElementById('buyCritChance').addEventListener('click', () => {
    const cost = 1000;
    if (score >= cost) {
        score -= cost;
        critChance += 0.05;
        scoreElement.textContent = Math.floor(score);
    }
});

function updateButtonStates() {
    // Обновление состояния кнопок магазина
    const buttons = {
        'buyMultiplier': { cost: 100 * multiplier, text: 'Купить множитель' },
        'buyAutoClicker': { cost: 500, text: 'Купить автокликер' },
        'buyComboBooster': { cost: 750, text: 'Купить усилитель комбо' },
        'buyCritChance': { cost: 1000, text: 'Улучшить шанс крита' }
    };

    Object.entries(buttons).forEach(([id, data]) => {
        const button = document.getElementById(id);
        if (button) {
            const canAfford = score >= data.cost;
            button.disabled = !canAfford;
            button.textContent = `${data.text} (${data.cost})`;
            
            if (canAfford) {
                button.classList.add('affordable');
            } else {
                button.classList.remove('affordable');
            }
        }
    });

    // Обновление состояния кнопок тем
    Object.entries(themes).forEach(([name, theme]) => {
        const btn = document.getElementById(theme.id);
        if (btn) {
            const canAfford = score >= theme.price || theme.owned;
            btn.disabled = !canAfford;
            updateThemeButton(btn, name, theme);
        }
    });
}

function buttonClickEffect(button) {
    button.classList.add('clicking');
    setTimeout(() => button.classList.remove('clicking'), 100);

    // Create ripple effect
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.position = 'absolute';
    ripple.style.width = '100%';
    ripple.style.height = '100%';
    ripple.style.top = '0';
    ripple.style.left = '0';
    ripple.style.background = 'rgba(255, 255, 255, 0.2)';
    ripple.style.borderRadius = 'inherit';
    ripple.style.animation = 'rippleEffect 0.6s ease-out';
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
}

// Add event listeners for click effects
document.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => buttonClickEffect(button));
    button.addEventListener('mouseenter', () => {
        if (!button.disabled) {
            button.style.transform = 'translateY(-2px)';
        }
    });
    button.addEventListener('mouseleave', () => {
        if (!button.disabled) {
            button.style.transform = 'translateY(0)';
        }
    });
});

// Add touch support for mobile devices
document.addEventListener('touchstart', (e) => {
    if (e.target.tagName === 'BUTTON') {
        e.preventDefault();
        e.target.classList.add('touching');
    }
});

document.addEventListener('touchend', (e) => {
    if (e.target.tagName === 'BUTTON') {
        e.target.classList.remove('touching');
    }
});

// Добавляем обработчики для всех кнопок
document.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => buttonClickEffect(button));
    button.addEventListener('mouseenter', () => {
        if (!button.disabled) {
            button.style.transform = 'translateY(-2px)';
        }
    });
    button.addEventListener('mouseleave', () => {
        if (!button.disabled) {
            button.style.transform = 'translateY(0)';
        }
    });
});

// Map keys to button actions
document.addEventListener('keydown', (e) => {
    if (e.repeat) return; // Ignore repeated keydown events

    const button = document.querySelector(`button[data-key="${e.code}" i]`);
    if (button && !button.disabled) {
        button.click();
        button.focus(); // Highlight the button for visual feedback
    }
});

// Add visual feedback for keyboard interaction
document.addEventListener('keyup', (e) => {
    const button = document.querySelector(`button[data-key="${e.code}" i]`);
    if (button) {
        button.blur(); // Remove focus after key release
    }
});

// Обновляем состояние кнопок каждую секунду
setInterval(updateButtonStates, 1000);

// Добавляем обработку касаний для мобильных устройств
document.addEventListener('touchstart', (e) => {
    if (e.target.tagName === 'BUTTON') {
        e.preventDefault();
        e.target.classList.add('touching');
    }
});

document.addEventListener('touchend', (e) => {
    if (e.target.tagName === 'BUTTON') {
        e.target.classList.remove('touching');
    }
});

setInterval(() => {
    if (autoClickerCount > 0) {
        updateScore(autoClickerCount);
    }
}, 1000);

// Загружаем игру при старте
loadGame();
setInterval(saveGame, 30000); // Автосохранение каждые 30 секунд

initThemes();

// Устанавливаем базовую тему при старте
document.addEventListener('DOMContentLoaded', () => {
    const activeTheme = localStorage.getItem('activeTheme') || 'default';
    applyTheme(activeTheme);
    updateButtonHints();
});