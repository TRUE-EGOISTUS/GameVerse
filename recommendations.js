const NodeCache = require('node-cache');
const recommendationsCache = new NodeCache({ stdTTL: 1800 }); // Кэш на 30 минут

function calculateGameScore(game, userPreferences) {
    let score = 0;
    
    // Фактор просмотров (максимум 30 баллов)
    const viewsScore = Math.min(game.views / 100, 1) * 30;
    score += viewsScore;
    
    // Фактор рейтинга (максимум 40 баллов)
    if (game.ratings && game.ratings.length > 0) {
        const avgRating = game.ratings.reduce((sum, r) => sum + r.rating, 0) / game.ratings.length;
        score += avgRating * 8; // 5 звезд * 8 = 40 максимум
    }
    
    // Фактор свежести (максимум 15 баллов)
    const ageInDays = (new Date() - new Date(game.uploadDate)) / (1000 * 60 * 60 * 24);
    const freshnessScore = Math.max(0, 15 - (ageInDays / 30) * 5);
    score += freshnessScore;
    
    // Бонусы за совпадение жанров и тегов (максимум 15 баллов)
    if (userPreferences) {
        // Совпадение жанра
        if (game.genre === userPreferences.favoriteGenre) {
            score += 8;
        }
        
        // Совпадение тегов
        const matchingTags = game.tags?.filter(tag => 
            userPreferences.favoriteTags?.includes(tag)
        ).length || 0;
        score += matchingTags * 2; // 2 балла за каждый совпадающий тег
    }
    
    return Math.round(score * 100) / 100;
}

function getRecommendations(games, user, options = {}) {
    const cacheKey = `recommendations_${user?.id || 'guest'}_${JSON.stringify(options)}`;
    const cached = recommendationsCache.get(cacheKey);
    if (cached) return cached;

    // Получаем предпочтения пользователя
    const userPreferences = buildUserPreferences(games, user);
    
    // Рассчитываем оценки для каждой игры
    const scoredGames = games.map(game => ({
        ...game,
        score: calculateGameScore(game, userPreferences)
    }));

    // Сортируем и фильтруем игры
    let recommended = scoredGames
        .filter(game => {
            // Исключаем игры самого пользователя
            if (user && game.author === user.username) return false;
            
            // Исключаем игры с низким рейтингом
            const avgRating = game.ratings?.reduce((sum, r) => sum + r.rating, 0) / (game.ratings?.length || 1);
            if (avgRating < (options.minRating || 0)) return false;
            
            return true;
        })
        .sort((a, b) => b.score - a.score);

    // Ограничиваем количество рекомендаций
    recommended = recommended.slice(0, options.limit || 5);
    
    // Кэшируем результат
    recommendationsCache.set(cacheKey, recommended);
    
    return recommended;
}

function buildUserPreferences(games, user) {
    if (!user) return null;

    // Находим игры, которые пользователь оценил высоко (4+ звезд)
    const userRatings = games.filter(game => 
        game.ratings?.some(r => 
            r.user === user.username && r.rating >= 4
        )
    );

    // Определяем любимый жанр
    const genreCounts = {};
    userRatings.forEach(game => {
        genreCounts[game.genre] = (genreCounts[game.genre] || 0) + 1;
    });
    const favoriteGenre = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0];

    // Определяем любимые теги
    const tagCounts = {};
    userRatings.forEach(game => {
        game.tags?.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
    });
    const favoriteTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => tag);

    return {
        favoriteGenre,
        favoriteTags,
        ratedGames: userRatings.length
    };
}

module.exports = {
    getRecommendations,
    calculateGameScore
};