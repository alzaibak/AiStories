function localizedQuizValue(value, language, field) {
  return value?.[language]?.[field] || value?.ar?.[field] || '';
}

function localizedTextValue(value, language) {
  return value?.[language] || value?.ar || '';
}

function localizedOptionValue(option, language) {
  return option.translations?.[language] || option.translations?.ar || option.text || '';
}

function publicQuestion(question, language, shuffleAnswers, shuffleItems = (items) => items) {
  const options = [...(question.answerOptions || [])]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((option) => ({
      id: option.id,
      text: localizedOptionValue(option, language)
    }));
  return {
    id: question.id,
    type: question.type || 'single_choice',
    points: question.points || 1,
    text: localizedQuizValue(question.translations, language, 'text') || question.text,
    options: shuffleAnswers ? shuffleItems(options) : options
  };
}

module.exports = {
  localizedQuizValue,
  localizedTextValue,
  localizedOptionValue,
  publicQuestion
};
