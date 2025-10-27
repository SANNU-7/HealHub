document.addEventListener('DOMContentLoaded', function () {
    const checkButton = document.getElementById('check-symptoms');
    const resultsSection = document.getElementById('results-section');
    const resultsContent = document.getElementById('results-content');
    const checkAgainButton = document.getElementById('check-again');
    const recentChecksList = document.getElementById('recent-checks-list');

    const csvState = { diseaseSymptoms: new Map(), diseasePrecautions: new Map(), ready: false };
    loadCSVData();

    // Voice input (Web Speech API)
    const micBtn = document.getElementById('voice-mic-btn');
    const customSymptomsEl = document.getElementById('custom-symptoms');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        // Hide mic if not supported
        if (micBtn) micBtn.style.display = 'none';
    } else if (micBtn && customSymptomsEl) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = (navigator.language || 'en-US');

        let isRecording = false;

        const startRecording = () => {
            try {
                recognition.start();
                isRecording = true;
                micBtn.classList.add('recording');
                micBtn.setAttribute('aria-label', 'Stop voice input');
            } catch (e) {
                // start may throw if already started; ignore
            }
        };

        const stopRecording = () => {
            try {
                recognition.stop();
            } catch (e) {
                // ignore
            }
            isRecording = false;
            micBtn.classList.remove('recording');
            micBtn.setAttribute('aria-label', 'Start voice input');
        };

        micBtn.addEventListener('click', () => {
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
        });

        recognition.addEventListener('result', (event) => {
            const transcript = Array.from(event.results)
                .map(r => r[0])
                .map(r => r.transcript)
                .join(' ')
                .trim();
            if (transcript) {
                const current = customSymptomsEl.value.trim();
                // Append with a space if needed
                customSymptomsEl.value = current ? (current + ' ' + transcript) : transcript;
            }
        });

        recognition.addEventListener('end', () => {
            // Auto-stop visuals when recognition ends (timeout or user stopped speaking)
            if (isRecording) {
                // Recognition may end automatically after a phrase; keep recording state off
                isRecording = false;
                micBtn.classList.remove('recording');
                micBtn.setAttribute('aria-label', 'Start voice input');
            }
        });

        recognition.addEventListener('error', () => {
            // On error, reset state and keep button available
            isRecording = false;
            micBtn.classList.remove('recording');
            micBtn.setAttribute('aria-label', 'Start voice input');
        });
    }

    // Load recent checks from localStorage
    localStorage.removeItem('recentSymptomChecks');
    loadRecentChecks();

    // Check symptoms button click handler - UPDATED WITH AI API
    checkButton.addEventListener('click', async function () {
        const selectedSymptoms = getSelectedSymptoms();
        const customSymptoms = document.getElementById('custom-symptoms').value.trim();

        if (selectedSymptoms.length === 0 && !customSymptoms) {
            alert('Please select at least one symptom or enter custom symptoms.');
            return;
        }

        // Show loading state
        const originalText = checkButton.innerHTML;
        checkButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing with AI...';
        checkButton.disabled = true;

        try {
            if (csvState.ready) {
                const csvAnalysis = analyzeWithCSV(selectedSymptoms, customSymptoms);
                if (csvAnalysis.possibleConditions.length > 0) {
                    displayCSVResults(csvAnalysis, selectedSymptoms, customSymptoms);
                    saveToRecentChecks(selectedSymptoms, customSymptoms, csvAnalysis);
                    resultsSection.style.display = 'block';
                    resultsSection.scrollIntoView({ behavior: 'smooth' });
                    return;
                }
            }
            const analysis = await analyzeWithAI(selectedSymptoms, customSymptoms);
            displayAIResults(analysis, selectedSymptoms, customSymptoms);

            // Save to recent checks
            saveToRecentChecks(selectedSymptoms, customSymptoms, analysis);

            // Show results section
            resultsSection.style.display = 'block';
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            alert('Error analyzing symptoms. Please try again.');
            console.error('Analysis error:', error);

            // Fallback to CSV or local analysis if API fails
            if (csvState.ready) {
                const csvAnalysis = analyzeWithCSV(selectedSymptoms, customSymptoms);
                if (csvAnalysis.possibleConditions.length > 0) {
                    displayCSVResults(csvAnalysis, selectedSymptoms, customSymptoms);
                    resultsSection.style.display = 'block';
                    resultsSection.scrollIntoView({ behavior: 'smooth' });
                    return;
                }
            }
            const localAnalysis = analyzeSymptoms(selectedSymptoms, customSymptoms);
            displayResults(localAnalysis);
            resultsSection.style.display = 'block';
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        } finally {
            // Restore button
            checkButton.innerHTML = originalText;
            checkButton.disabled = false;
        }
    });

    // Check again button click handler
    checkAgainButton.addEventListener('click', function () {
        // Reset form
        document.querySelectorAll('input[name="symptoms"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        document.getElementById('custom-symptoms').value = '';

        // Hide results
        resultsSection.style.display = 'none';

        // Scroll to top of form
        document.querySelector('.symptom-form').scrollIntoView({ behavior: 'smooth' });
    });

    // NEW: AI API Integration Function
    async function analyzeWithAI(symptoms, customSymptoms) {
        try {
            const response = await fetch('/api/analyze-symptoms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    symptoms: symptoms,
                    custom_symptoms: customSymptoms
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error calling AI API:', error);
            throw error; // Re-throw to handle in the main function
        }
    }

    // NEW: Display AI Results Function
    function displayAIResults(analysis, selectedSymptoms, customSymptoms) {
        let html = '';

        // Display selected symptoms
        if (selectedSymptoms.length > 0) {
            html += '<div class="symptoms-summary">';
            html += '<h4>🧩 Selected Symptoms:</h4>';
            html += '<div class="symptoms-list">';
            selectedSymptoms.forEach(symptom => {
                html += `<span class="symptom-tag">${formatSymptomName(symptom)}</span>`;
            });
            html += '</div></div>';
        }

        // Display custom symptoms
        if (customSymptoms) {
            html += '<div class="custom-symptoms-summary">';
            html += '<h4>📝 Additional Symptoms:</h4>';
            html += `<p>${customSymptoms}</p>`;
            html += '</div>';
        }

        // Display AI analysis
        html += '<div class="ai-analysis">';
        html += '<h4>🤖 AI Analysis:</h4>';
        html += `<div class="analysis-content">${formatAIText(analysis.analysis)}</div>`;
        html += '</div>';

        // Add disclaimer
        html += `
            <div class="results-disclaimer">
                <p><strong>⚠️ Important:</strong> ${analysis.disclaimer}</p>
            </div>
        `;

        resultsContent.innerHTML = html;
    }

    // NEW: Format AI text (preserves line breaks)
    function formatAIText(text) {
        return text.replace(/\n/g, '<br>');
    }

    // Keep existing local analysis as fallback
    function getSelectedSymptoms() {
        const checkboxes = document.querySelectorAll('input[name="symptoms"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    // Local symptom analysis (fallback)
    function analyzeSymptoms(selectedSymptoms, customSymptoms) {
        const symptomConditions = {
            'flu': ['fever', 'cough', 'headache', 'fatigue', 'body-ache'],
            'cold': ['cough', 'sore-throat', 'headache', 'fatigue'],
            'covid': ['fever', 'cough', 'shortness-breath', 'fatigue', 'body-ache'],
            'food-poisoning': ['nausea', 'fatigue', 'body-ache'],
            'migraine': ['headache', 'nausea'],
            'bronchitis': ['cough', 'shortness-breath', 'fatigue'],
            'strep-throat': ['sore-throat', 'fever', 'headache'],
            'gastroenteritis': ['nausea', 'fatigue', 'body-ache']
        };

        const conditionInfo = {
            'flu': {
                name: 'Flu (Influenza)',
                description: 'A viral infection that attacks your respiratory system.',
                advice: 'Rest, stay hydrated, and consider over-the-counter medications. Consult a doctor if symptoms persist or worsen.',
                urgency: 'medium'
            },
            'cold': {
                name: 'Common Cold',
                description: 'A mild viral infection of the nose and throat.',
                advice: 'Rest, drink plenty of fluids, and use over-the-counter cold medications. Most colds resolve within 7-10 days.',
                urgency: 'low'
            },
            'covid': {
                name: 'COVID-19',
                description: 'A viral illness caused by the coronavirus.',
                advice: 'Isolate yourself and get tested immediately. Contact healthcare provider for guidance. Monitor for severe symptoms.',
                urgency: 'high'
            },
            'food-poisoning': {
                name: 'Food Poisoning',
                description: 'Illness caused by consuming contaminated food or drink.',
                advice: 'Stay hydrated, rest, and avoid solid foods temporarily. Seek medical attention if severe vomiting or diarrhea persists.',
                urgency: 'medium'
            },
            'migraine': {
                name: 'Migraine',
                description: 'A severe headache often accompanied by nausea and sensitivity to light.',
                advice: 'Rest in a dark, quiet room. Consider over-the-counter pain relievers. Consult a doctor if migraines are frequent.',
                urgency: 'low'
            },
            'bronchitis': {
                name: 'Bronchitis',
                description: 'Inflammation of the bronchial tubes, often causing coughing.',
                advice: 'Rest, stay hydrated, and avoid irritants. Consult a doctor if symptoms persist beyond 3 weeks.',
                urgency: 'medium'
            },
            'strep-throat': {
                name: 'Strep Throat',
                description: 'A bacterial infection causing sore throat and fever.',
                advice: 'Consult a doctor for proper diagnosis and antibiotics. Rest and stay hydrated.',
                urgency: 'medium'
            },
            'gastroenteritis': {
                name: 'Gastroenteritis',
                description: 'Inflammation of the stomach and intestines, often called stomach flu.',
                advice: 'Stay hydrated, rest, and eat bland foods. Seek medical attention if symptoms are severe or persistent.',
                urgency: 'medium'
            }
        };

        const possibleConditions = [];

        // Check against predefined conditions
        for (const [condition, requiredSymptoms] of Object.entries(symptomConditions)) {
            const matchCount = requiredSymptoms.filter(symptom =>
                selectedSymptoms.includes(symptom)
            ).length;

            const matchPercentage = (matchCount / requiredSymptoms.length) * 100;

            if (matchPercentage >= 50) { // At least 50% symptom match
                possibleConditions.push({
                    condition: condition,
                    matchPercentage: matchPercentage,
                    info: conditionInfo[condition]
                });
            }
        }

        // Sort by match percentage
        possibleConditions.sort((a, b) => b.matchPercentage - a.matchPercentage);

        return {
            selectedSymptoms: selectedSymptoms,
            customSymptoms: customSymptoms,
            possibleConditions: possibleConditions,
            timestamp: new Date().toLocaleString(),
            isLocalAnalysis: true
        };
    }

    function extractCustomSymptoms(text, allSymptoms) {
        if (!text) return [];
        let t = String(text).toLowerCase().trim();
        if (!t) return [];
        // Normalize common connectors to commas
        t = t.replace(/\b(and|with|having|plus)\b/gi, ',')
            .replace(/[\/|]/g, ',');
        // If user already used delimiters, split on them
        const hasDelims = /[,;\n]/.test(t);
        let rawParts = hasDelims ? t.split(/[,;\n]+/) : [t];
        rawParts = rawParts.map(s => s.trim()).filter(Boolean);

        // Build a list of normalized tokens. If there is just one free-text blob with spaces,
        // try to extract multi-word phrases that exist in dataset via n-grams.
        const results = new Set();
        const pushIfValid = (phrase) => {
            const norm = normalizeSymptom(phrase);
            if (!norm) return;
            if (allSymptoms.has(norm)) {
                results.add(norm);
            }
        };

        rawParts.forEach(part => {
            if (part.includes(' ')) {
                const words = part.split(/\s+/).filter(Boolean);
                // n-grams up to 4 tokens (covers most dataset phrases)
                const maxN = Math.min(4, words.length);
                let matchedAny = false;
                for (let n = maxN; n >= 2; n--) {
                    for (let i = 0; i + n <= words.length; i++) {
                        const phrase = words.slice(i, i + n).join(' ');
                        const norm = normalizeSymptom(phrase);
                        if (allSymptoms.has(norm)) {
                            results.add(norm);
                            matchedAny = true;
                        }
                    }
                }
                // If nothing matched, fall back to single tokens (some symptoms are single words)
                if (!matchedAny) {
                    words.forEach(w => {
                        const norm = normalizeSymptom(w);
                        if (allSymptoms.has(norm)) results.add(norm);
                    });
                }
            } else {
                pushIfValid(part);
            }
        });

        // If still empty (user typed like "fever cough headache" with no matches yet),
        // split by spaces and accept individual words.
        if (results.size === 0 && rawParts.length === 1) {
            const words = rawParts[0].split(/\s+/).filter(Boolean);
            words.forEach(w => {
                const norm = normalizeSymptom(w);
                if (allSymptoms.has(norm)) results.add(norm);
            });
        }

        return Array.from(results);
    }

    // Fallback display function
    function displayResults(analysis) {
        let html = '';

        // Display selected symptoms
        if (analysis.selectedSymptoms.length > 0) {
            html += '<div class="symptoms-summary">';
            html += '<h4>Selected Symptoms:</h4>';
            html += '<div class="symptoms-list">';
            analysis.selectedSymptoms.forEach(symptom => {
                html += `<span class="symptom-tag">${formatSymptomName(symptom)}</span>`;
            });
            html += '</div></div>';
        }

        // Display custom symptoms
        if (analysis.customSymptoms) {
            html += '<div class="custom-symptoms-summary">';
            html += '<h4>Additional Symptoms:</h4>';
            html += `<p>${analysis.customSymptoms}</p>`;
            html += '</div>';
        }

        // Display local analysis warning if API failed
        if (analysis.isLocalAnalysis) {
            html += '<div class="local-analysis-warning">';
            html += '<p><strong>⚠️ Note:</strong> Using local analysis. AI service is temporarily unavailable.</p>';
            html += '</div>';
        }

        // Display possible conditions
        if (analysis.possibleConditions.length > 0) {
            html += '<div class="conditions-results">';
            html += '<h4>Possible Conditions:</h4>';

            analysis.possibleConditions.forEach((condition, index) => {
                const urgencyClass = condition.info.urgency;
                html += `
                    <div class="condition-card ${urgencyClass}">
                        <div class="condition-header">
                            <h5>${condition.info.name}</h5>
                            <span class="match-percentage">${Math.round(condition.matchPercentage)}% match</span>
                        </div>
                        <p><strong>Description:</strong> ${condition.info.description}</p>
                        <p><strong>Advice:</strong> ${condition.info.advice}</p>
                        <div class="urgency-indicator urgency-${urgencyClass}">
                            ${getUrgencyText(condition.info.urgency)}
                        </div>
                    </div>
                `;
            });

            html += '</div>';
        } else {
            html += '<div class="no-conditions">';
            html += '<p>No specific conditions matched your symptoms. This could indicate:</p>';
            html += '<ul>';
            html += '<li>A less common condition</li>';
            html += '<li>Multiple minor issues</li>';
            html += '<li>Symptoms that need professional medical evaluation</li>';
            html += '</ul>';
            html += '<p><strong>Recommendation:</strong> Please consult a healthcare professional for proper diagnosis.</p>';
            html += '</div>';
        }

        // Add disclaimer
        html += `
            <div class="results-disclaimer">
                <p><strong>Important:</strong> This analysis is for educational purposes only and is not a substitute for professional medical advice. Always consult a healthcare provider for proper diagnosis and treatment.</p>
            </div>
        `;

        resultsContent.innerHTML = html;
    }

    function formatSymptomName(symptom) {
        return symptom.split('-').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    function getUrgencyText(urgency) {
        const urgencyMap = {
            'low': 'Low Priority',
            'medium': 'Medium Priority',
            'high': 'High Priority - Seek Medical Attention'
        };
        return urgencyMap[urgency] || 'Unknown';
    }

    function saveToRecentChecks(selectedSymptoms, customSymptoms, analysis) {
        const recentChecks = getRecentChecks();

        const newCheck = {
            id: Date.now(),
            selectedSymptoms: selectedSymptoms,
            customSymptoms: customSymptoms,
            timestamp: new Date().toLocaleString(),
            conditionsCount: analysis.possibleConditions ? analysis.possibleConditions.length : 0,
            isAIAnalysis: !analysis.isLocalAnalysis
        };

        recentChecks.unshift(newCheck);

        // Keep only last 3 checks
        if (recentChecks.length > 3) {
            recentChecks.splice(3);
        }

        localStorage.setItem('recentSymptomChecks', JSON.stringify(recentChecks));
        loadRecentChecks();
    }

    function getRecentChecks() {
        const checks = localStorage.getItem('recentSymptomChecks');
        return checks ? JSON.parse(checks) : [];
    }

    function loadRecentChecks() {
        const recentChecks = getRecentChecks();

        if (recentChecks.length === 0) {
            recentChecksList.innerHTML = '<p>No recent symptom checks yet.</p>';
            return;
        }

        let html = '';
        recentChecks.forEach(check => {
            html += `
                <div class="recent-check-item">
                    <div class="recent-check-header">
                        <span class="check-date">${check.timestamp}</span>
                        <span class="check-conditions">
                            ${check.conditionsCount} condition(s) found 
                            ${check.isAIAnalysis ? '🤖' : '💾'}
                        </span>
                    </div>
                    <div class="recent-check-symptoms">
                        ${check.selectedSymptoms.map(s => `<span class="symptom-tag-small">${formatSymptomName(s)}</span>`).join('')}
                        ${check.customSymptoms ? `<span class="custom-symptoms-indicator">+ custom</span>` : ''}
                    </div>
                </div>
            `;
        });

        recentChecksList.innerHTML = html;
    }

    async function loadCSVData() {
        try {
            const [symText, precText] = await Promise.all([
                fetch('DiseaseAndSymptoms.csv').then(r => r.ok ? r.text() : ''),
                fetch('Disease precaution.csv').then(r => r.ok ? r.text() : '')
            ]);
            if (symText) parseSymptomsCSV(symText);
            if (precText) parsePrecautionsCSV(precText);
            csvState.ready = csvState.diseaseSymptoms.size > 0;
        } catch (_) {
            csvState.ready = false;
        }
    }

    function parseCSVLines(text) {
        return text.split(/\r?\n/).filter(Boolean);
    }

    function parseSymptomsCSV(text) {
        const lines = parseCSVLines(text);
        if (lines.length <= 1) return;
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(',');
            if (!cells.length) continue;
            const disease = (cells[0] || '').trim();
            if (!disease) continue;
            const symptoms = new Set();
            for (let c = 1; c < cells.length; c++) {
                const token = (cells[c] || '')
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, '_')
                    .replace(/-+/g, '_')
                    .replace(/_+/g, '_');
                if (token) symptoms.add(token);
            }
            if (!csvState.diseaseSymptoms.has(disease)) csvState.diseaseSymptoms.set(disease, new Set());
            const agg = csvState.diseaseSymptoms.get(disease);
            symptoms.forEach(s => agg.add(s));
        }
    }

    function parsePrecautionsCSV(text) {
        const lines = parseCSVLines(text);
        if (lines.length <= 1) return;
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(',');
            if (!cells.length) continue;
            const disease = (cells[0] || '').trim();
            if (!disease) continue;
            const precs = [];
            for (let c = 1; c < cells.length; c++) {
                const p = (cells[c] || '').trim();
                if (p) precs.push(p);
            }
            if (precs.length) csvState.diseasePrecautions.set(disease, precs);
        }
    }

    function normalizeSymptom(s) {
        return (s || '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '_')
            .replace(/-+/g, '_')
            .replace(/_+/g, '_');
    }

    function expandSymptomSynonyms(sym) {
        const n = normalizeSymptom(sym);
        const map = {
            'fever': ['fever', 'high_fever'],
            'shortness_breath': ['shortness_of_breath', 'breathlessness', 'shortness_breath'],
            'shortness-breath': ['shortness_of_breath', 'breathlessness', 'shortness_breath'],
            'body_ache': ['body_ache', 'muscle_pain', 'body_pain'],
            'body-ache': ['body_ache', 'muscle_pain', 'body_pain'],
            'sore_throat': ['sore_throat', 'throat_irritation', 'patches_in_throat'],
            'sore-throat': ['sore_throat', 'throat_irritation', 'patches_in_throat']
        };
        return map[n] ? map[n] : [n];
    }

    function analyzeWithCSV(selectedSymptoms, customSymptoms) {
        const userTokens = new Set();
        selectedSymptoms.forEach(s => expandSymptomSynonyms(s).forEach(t => userTokens.add(t)));
        const allSymptoms = new Set();
        csvState.diseaseSymptoms.forEach((set) => set.forEach(sym => allSymptoms.add(sym)));
        const customList = extractCustomSymptoms(customSymptoms, allSymptoms);
        customList.forEach(s => expandSymptomSynonyms(s).forEach(t => userTokens.add(t)));

        const results = [];
        csvState.diseaseSymptoms.forEach((symSet, disease) => {
            const diseaseTokens = Array.from(symSet);
            let matches = 0;
            diseaseTokens.forEach(t => { if (userTokens.has(t)) matches++; });
            if (matches > 0) {
                const total = diseaseTokens.length || 1;
                const score = (matches / total) * 100;
                results.push({
                    disease,
                    matchPercentage: score,
                    matches,
                    total,
                    precautions: csvState.diseasePrecautions.get(disease) || []
                });
            }
        });
        results.sort((a, b) => b.matchPercentage - a.matchPercentage || b.matches - a.matches);
        return {
            selectedSymptoms,
            customSymptoms,
            possibleConditions: results.map(r => ({
                condition: r.disease,
                matchPercentage: r.matchPercentage,
                info: {
                    name: r.disease,
                    description: 'Based on your reported symptoms, this condition may be relevant. Consider the precautions and seek medical advice if needed.',
                    advice: (r.precautions && r.precautions.length) ? ('Precautions: ' + r.precautions.join('; ')) : 'Maintain rest, hydration, and monitor symptoms. Seek medical care if symptoms worsen or red flags occur (chest pain, severe shortness of breath, confusion, persistent high fever).',
                    urgency: 'medium'
                }
            })),
            timestamp: new Date().toLocaleString(),
            isLocalAnalysis: true
        };
    }

    function displayCSVResults(analysis, selectedSymptoms, customSymptoms) {
        let html = '';
        if (selectedSymptoms.length > 0) {
            html += '<div class="symptoms-summary">';
            html += '<h4>🧩 Selected Symptoms:</h4>';
            html += '<div class="symptoms-list">';
            selectedSymptoms.forEach(symptom => {
                html += `<span class="symptom-tag">${formatSymptomName(symptom)}</span>`;
            });
            html += '</div></div>';
        }
        if (customSymptoms) {
            html += '<div class="custom-symptoms-summary">';
            html += '<h4>📝 Additional Symptoms:</h4>';
            html += `<p>${customSymptoms}</p>`;
            html += '</div>';
        }
        if (analysis.possibleConditions && analysis.possibleConditions.length > 0) {
            html += '<div class="conditions-results">';
            html += '<h4>Possible Conditions & Precautions:</h4>';
            analysis.possibleConditions.forEach((condition) => {
                const name = condition.info.name;
                const description = condition.info.description;
                const advice = condition.info.advice;
                html += `
                    <div class="condition-card medium">
                        <div class="condition-header">
                            <h5>${name}</h5>
                            <span class="match-percentage">${Math.round(condition.matchPercentage)}% match</span>
                        </div>
                        <p><strong>Description:</strong> ${description}</p>
                        <p><strong>Advice & Precautions:</strong> ${advice}</p>
                        <div class="urgency-indicator urgency-medium">Medium Priority</div>
                    </div>
                `;
            });
            html += '</div>';
        } else {
            html += '<div class="no-conditions">';
            html += '<p>No clear matches from the dataset. Consider refining your symptom list.</p>';
            html += '<p><strong>Recommendation:</strong> Consult a healthcare professional for proper diagnosis.</p>';
            html += '</div>';
        }
        html += `
            <div class="results-disclaimer">
                <p><strong>Important:</strong> This analysis is for educational purposes only and is not a substitute for professional medical advice. Always consult a healthcare provider for proper diagnosis and treatment.</p>
            </div>
        `;
        resultsContent.innerHTML = html;
    }
});