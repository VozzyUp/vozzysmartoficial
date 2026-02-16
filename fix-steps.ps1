# Script to fix step variable names in provision route
$filePath = "d:\VozzyUp\Produtos\VozzySmart\vozzySmart\app\api\installer\provision\route.ts"
$content = Get-Content $filePath -Raw

# Map of line patterns to replacements
# Step 4
$content = $content -replace '(?m)^(\s+)// Step 4: Validate Supabase PAT\r?\n\s+console\.log\(\[provision\] 📍 Step 4/15.*?\r?\n\s+const step3 = STEPS', '$1// Step 4: Validate Supabase PAT$1console.log(''[provision] 📍 Step 4/15: Validate Supabase PAT - INICIANDO'');$1const step4 = STEPS'
$content = $content -replace '(Step 4.*?title: )step2\.title', '$1step4.title'
$content = $content -replace '(Step 4.*?subtitle: )step2\.subtitle', '$1step4.subtitle'

# Step 5  
$content = $content -replace '(?m)(// Step 5:.*?\r?\n.*?console\.log.*?Step 5/15.*?\r?\n\s+)const step3 = STEPS', '$1const step5 = STEPS'

# Step 6
$content = $content -replace '(?m)(// Step.*?Wait.*?project.*?\r?\n.*?console\.log.*?Step.*?/15.*?INICIANDO.*?\r?\n\s+)const step3 = STEPS', '$1const step6 = STEPS'

# Step 7
$content = $content -replace '(?m)(// Step.*?Resolve.*?keys.*?\r?\n.*?console\.log.*?Step.*?/15.*?INICIANDO.*?\r?\n\s+)const step3 = STEPS', '$1const step7 = STEPS'

# Step 8
$content = $content -replace '(?m)(// Step.*?Validate QStash.*?\r?\n.*?console\.log.*?Step.*?/15.*?INICIANDO.*?\r?\n\s+)const step3 = STEPS', '$1const step8 = STEPS'

# Step 9
$content = $content -replace '(?m)(// Step.*?Validate Redis.*?\r?\n.*?console\.log.*?Step.*?/15.*?INICIANDO.*?\r?\n\s+)const step3 = STEPS', '$1const step9 = STEPS'

# Step 10
$content = $content -replace '(?m)(// Step.*?Setup.*?env.*?\r?\n.*?console\.log.*?Step.*?/15.*?INICIANDO.*?\r?\n\s+)const step3 = STEPS', '$1const step10 = STEPS'

# Step 11 (migrations)
$content = $content -replace '(?m)(// Step.*?Run migrations.*?\r?\n.*?console\.log.*?Step.*?/15.*?Run Migrations.*?\r?\n.*?dbUrl.*?\r?\n\s+)const step3 = STEPS', '$1const step11 = STEPS'

# Step 12 (bootstrap)
$content = $content -replace '(?m)(// Step.*?Bootstrap.*?admin.*?\r?\n.*?console\.log.*?Step.*?/15.*?Bootstrap.*?\r?\n\s+)const step3 = STEPS', '$1const step12 = STEPS'

# Step 13 (redeploy)
$content = $content -replace '(?m)(// Step.*?Redeploy.*?\r?\n.*?console\.log.*?Step.*?/15.*?Redeploy.*?\r?\n\s+)const step3 = STEPS', '$1const step13 = STEPS'

# Step 14 (wait deploy)
$content = $content -replace '(?m)(// Step.*?Wait for deploy.*?\r?\n.*?console\.log.*?Step.*?/15.*?Wait.*?Deploy.*?\r?\n\s+)const step3 = STEPS', '$1const step14 = STEPS'

# Fix references
$content = $content -replace 'title: step4\.title', 'title: step4.title'
$content = $content -replace 'title: step5\.title', 'title: step5.title'
$content = $content -replace 'title: step6\.title', 'title: step6.title'
$content = $content -replace 'title: step7\.title', 'title: step7.title'
$content = $content -replace 'title: step8\.title', 'title: step8.title'
$content = $content -replace 'title: step9\.title', 'title: step9.title'
$content = $content -replace 'title: step10\.title', 'title: step10.title'
$content = $content -replace 'title: step11\.title', 'title: step11.title'
$content = $content -replace 'title: step12\.title', 'title: step12.title'
$content = $content -replace 'title: step13\.title', 'title: step13.title'
$content = $content -replace 'title: step14\.title', 'title: step14.title'

Set-Content $filePath $content -NoNewline
Write-Host "Fixed all step variables!"
