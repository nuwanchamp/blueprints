# =============================================================
#  Mouse Skills Adventure with Pip
#  OPEN SESAME  (unit_1_level_9)
#  Skill: double-click = open (the real-world meaning)
#
#  ART — your three animated object scenes:
#      res://Scenes/unit1-level-9/Chest-open.tscn
#      res://Scenes/unit1-level-9/Door-open.tscn
#      res://Scenes/unit1-level-9/Present-open.tscn
#  Each has an AnimatedSprite2D with a closed "default" pose, a
#  *-single-click animation (the knock/jiggle) and a
#  *-double-click animation (the full opening). Names vary per
#  object (and the door says "dubble"), so the script resolves
#  them by KEYWORD — no renaming needed.
#
#  MECHANIC
#  - One object at a time in the centre: chest -> door -> present.
#  - Our own generous double-click window (0.7 s), NOT the OS one.
#  - Single click: the object's single-click animation + a knock;
#    if no second click arrives in time, Pip coaches gently.
#  - Click-click: the object's double-click animation plays, then
#    the surprise (jewels / party / puppy) with its voice clip.
#  - All 3 opened -> the global star.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 9
const DOUBLE_CLICK_WINDOW := 0.7    # generous, per the level plan
const IDLE_HINT_SECONDS := 8.0

const COL_BG   := Color("efe3f7")   # storybook lavender
const COL_TEXT := Color("6b4a8c")

# --- Custom display font, same as the other levels ---
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")

# --- Custom cursor, same on every screen ---
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

# --- The three objects, in play order ---
const OBJECT_SCENES: Array[PackedScene] = [
	preload("res://Scenes/unit1-level-9/Chest-open.tscn"),
	preload("res://Scenes/unit1-level-9/Door-open.tscn"),
	preload("res://Scenes/unit1-level-9/Present-open.tscn"),
]

# --- Recorded voice clips (filenames exactly as in the project) ---
const VOICE_INTRO: AudioStream    = preload("res://Assets/unit1-level9/onle-click-knocks.mp3")
const VOICE_COACH: AudioStream    = preload("res://Assets/unit1-level9/almost-faster.mp3")
const VOICE_BIG_DOOR: AudioStream = preload("res://Assets/unit1-level9/big-door.mp3")
const VOICE_PRESENT: AudioStream  = preload("res://Assets/unit1-level9/A present.mp3")
const VOICE_SPARKLY: AudioStream  = preload("res://Assets/unit1-level9/oooh-sparkly.mp3")
const VOICE_PARTY: AudioStream    = preload("res://Assets/unit1-level9/a party.mp3")
const VOICE_PUPPY: AudioStream    = preload("res://Assets/unit1-level9/a-puppy.mp3")
const VOICE_CHAMPION: AudioStream = preload("res://Assets/unit1-level9/click-click-champion.mp3")

var _stage := 0                  # 0 chest, 1 door, 2 present
var _object: Node2D              # current object scene instance
var _object_sprite: AnimatedSprite2D
var _anim_idle := "default"
var _anim_single := ""
var _anim_double := ""
var _object_open := false
var _busy := false               # mid-open animation, ignore clicks
var _finished := false

var _first_click_time := -10.0
var _pending_coach: SceneTreeTimer

var _idle_timer: Timer
var _voice: AudioStreamPlayer
var _ghost: Node2D
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _current_instruction := "TWO quick clicks — click-click! — opens it!"
var _hand_cursor_on := false


# ----------------------------------------------------------------
#  Setup
# ----------------------------------------------------------------
func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_POINTING_HAND)

	randomize()
	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	# Must ignore the mouse, or the hand cursor never shows.
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	_build_ui()
	_build_ghost_cursor()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_INTRO,
		"One click knocks... but TWO quick clicks — click-click! — opens it! Try: click-click!")
	_show_stage(0)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_POINTING_HAND)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


func _object_center() -> Vector2:
	return _screen_size() * 0.5 + Vector2(0, 40)


func _object_target_height() -> float:
	return _screen_size().y * 0.42


func _object_radius() -> float:
	# Generous circular hit area around the object.
	return _object_target_height() * 0.55


# ----------------------------------------------------------------
#  Stage objects (your animated scenes)
# ----------------------------------------------------------------
func _show_stage(stage: int) -> void:
	_stage = stage
	_object_open = false
	_busy = false
	if _object:
		_object.queue_free()

	_object = OBJECT_SCENES[stage].instantiate() as Node2D
	add_child(_object)

	_object_sprite = _find_animated_sprite(_object)
	assert(_object_sprite != null, "object scene needs an AnimatedSprite2D")
	_object_sprite.centered = true
	_object_sprite.position = Vector2.ZERO
	_object_sprite.offset = Vector2.ZERO
	_resolve_anim_names()

	# Scale the object so its closed pose is a consistent size. Some source
	# art (the door especially) has a lot of transparent canvas around the
	# actual picture, so measure the real content box rather than the raw
	# texture size, and re-centre it too — otherwise a big padded canvas
	# both undersizes the object and throws off the click hit-circle below.
	var frame_size := Vector2(100, 100)
	var content_height := 100.0
	var tex := _object_sprite.sprite_frames.get_frame_texture(_anim_idle, 0)
	if tex:
		frame_size = tex.get_size()
		content_height = frame_size.y
		var img := tex.get_image()
		if img:
			var used := img.get_used_rect()
			if used.size.y > 0:
				content_height = used.size.y
				var content_center := Vector2(used.position) + Vector2(used.size) * 0.5
				_object_sprite.offset = frame_size * 0.5 - content_center
	_object.scale = Vector2.ONE * (_object_target_height() / content_height)

	# One-shot reactions; return to the closed pose after a knock.
	if _anim_single != "":
		_object_sprite.sprite_frames.set_animation_loop(_anim_single, false)
	if _anim_double != "":
		_object_sprite.sprite_frames.set_animation_loop(_anim_double, false)
	_object_sprite.animation_finished.connect(_on_object_anim_finished)

	_object_sprite.play(_anim_idle)
	_object_sprite.stop()
	_object_sprite.frame = 0

	_object.position = _object_center()
	var base := _object.scale
	_object.scale = Vector2.ZERO
	var t := create_tween()
	t.tween_property(_object, "scale", base * 1.1, 0.4)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(_object, "scale", base, 0.15)
	_idle_timer.start()

	if stage == 1:
		_say(VOICE_BIG_DOOR, "A big door! Click-click to open it!")
	elif stage == 2:
		_say(VOICE_PRESENT, "A present! Click-click to open it!")


func _find_animated_sprite(node: Node) -> AnimatedSprite2D:
	if node is AnimatedSprite2D:
		return node as AnimatedSprite2D
	for child in node.get_children():
		var found := _find_animated_sprite(child)
		if found:
			return found
	return null


func _resolve_anim_names() -> void:
	# Match animations by keyword so per-object naming (and the
	# door's "dubble" spelling) all resolve without renaming.
	_anim_idle = "default"
	_anim_single = ""
	_anim_double = ""
	var names := _object_sprite.sprite_frames.get_animation_names()
	for n in names:
		var lower := String(n).to_lower()
		if lower.contains("single"):
			_anim_single = n
		elif lower.contains("double") or lower.contains("dubble"):
			_anim_double = n
		elif lower.contains("default"):
			_anim_idle = n
	if _anim_idle == "default" and not _object_sprite.sprite_frames.has_animation("default"):
		_anim_idle = names[0] if names.size() > 0 else "default"


func _on_object_anim_finished() -> void:
	# After the knock reaction, settle back to the closed pose.
	if not _object_open and _object_sprite.animation == _anim_single:
		_object_sprite.play(_anim_idle)
		_object_sprite.stop()
		_object_sprite.frame = 0


func _anim_duration(anim: String) -> float:
	if anim == "" or not _object_sprite.sprite_frames.has_animation(anim):
		return 0.5
	var frames := _object_sprite.sprite_frames.get_frame_count(anim)
	var fps := _object_sprite.sprite_frames.get_animation_speed(anim)
	if fps <= 0.0:
		fps = 5.0
	return float(frames) / fps


# ----------------------------------------------------------------
#  Hover: pointing-hand cursor
# ----------------------------------------------------------------
func _process(_delta: float) -> void:
	if _finished or _object == null or _object_open:
		return
	var mouse := get_viewport().get_mouse_position()
	var over := mouse.distance_to(_object.position) <= _object_radius()
	if over and not _hand_cursor_on:
		Input.set_default_cursor_shape(Input.CURSOR_POINTING_HAND)
	elif not over and _hand_cursor_on:
		Input.set_default_cursor_shape(Input.CURSOR_ARROW)
	_hand_cursor_on = over


# ----------------------------------------------------------------
#  Clicks: our own generous double-click detection
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		_idle_timer.start()
		_hide_ghost()
		return
	if _finished or _busy or _object_open or not (event is InputEventMouseButton):
		return
	var mb := event as InputEventMouseButton
	if not mb.pressed or mb.button_index != MOUSE_BUTTON_LEFT:
		return
	_idle_timer.start()
	_hide_ghost()

	var on_object := mb.position.distance_to(_object.position) <= _object_radius()
	if not on_object:
		return   # misclicks do nothing

	var now := Time.get_ticks_msec() / 1000.0
	if now - _first_click_time <= DOUBLE_CLICK_WINDOW:
		# Second click in time: OPEN!
		_first_click_time = -10.0
		_pending_coach = null
		_open_object()
	else:
		# First click: knock — the object's own single-click
		# animation plays the jiggle.
		_first_click_time = now
		_play_tone(400.0, 380.0, 0.07, 0.25)   # knock
		if _anim_single != "":
			_object_sprite.stop()
			_object_sprite.play(_anim_single)
		# If no second click arrives in time, coach gently.
		var timer := get_tree().create_timer(DOUBLE_CLICK_WINDOW + 0.05)
		_pending_coach = timer
		timer.timeout.connect(func () -> void:
			if _pending_coach == timer and not _object_open and not _finished:
				_say(VOICE_COACH, "Almost! Faster — click-click!")
		)


# ----------------------------------------------------------------
#  Opening + surprises
# ----------------------------------------------------------------
func _open_object() -> void:
	_object_open = true
	_busy = true
	Input.set_default_cursor_shape(Input.CURSOR_ARROW)
	_hand_cursor_on = false
	_play_tone(500.0, 1000.0, 0.25, 0.3)   # ta-da sweep

	# The object's own double-click animation does the opening.
	_object_sprite.stop()
	if _anim_double != "":
		_object_sprite.play(_anim_double)

	var t := create_tween()
	t.tween_interval(_anim_duration(_anim_double) * 0.7)   # surprise near the end
	t.tween_callback(func () -> void: _do_surprise(_stage))
	t.tween_interval(_anim_duration(_anim_double) * 0.3 + 2.0)
	t.tween_callback(_next_stage)


func _do_surprise(stage: int) -> void:
	# The scenes' own double-click animations show what is inside
	# (the party through the door, the puppy in the present), so
	# these surprises are just voice + a light sparkle of confetti.
	var pos := _object.position
	match stage:
		0:   # chest
			_say(VOICE_SPARKLY, "Ooooh! Sparkly jewels!")
			_burst_confetti(pos)
		1:   # door
			_say(VOICE_PARTY, "A party! Hooray!")
			_burst_confetti(pos)
		2:   # present
			_say(VOICE_PUPPY, "A puppy! Woof woof!")
			_play_tone_delayed(600.0, 500.0, 0.1, 0.25, 0.4)   # woof
			_play_tone_delayed(600.0, 500.0, 0.1, 0.25, 0.6)   # woof


func _next_stage() -> void:
	if _stage < OBJECT_SCENES.size() - 1:
		_show_stage(_stage + 1)
	else:
		_finish_level()


# ----------------------------------------------------------------
#  Finish + star (handled by the global StarChart autoload)
# ----------------------------------------------------------------
func _finish_level() -> void:
	_finished = true
	_idle_timer.stop()
	_hide_ghost()
	Input.set_default_cursor_shape(Input.CURSOR_ARROW)
	_say(VOICE_CHAMPION, "Click-click champion! You opened everything!")
	# Let the whole clip play before the star celebration starts.
	await _voice.finished
	await get_tree().create_timer(0.3).timeout
	StarChart.show_chart(StarChart.UNIT_1_LEVELS)
	await StarChart.add_star(LEVEL_NUMBER)
	level_completed.emit(LEVEL_NUMBER)
	get_tree().change_scene_to_file("res://Scenes/unit1-level10.tscn")


# ----------------------------------------------------------------
#  Effects
# ----------------------------------------------------------------
func _burst_confetti(pos: Vector2) -> void:
	var p := CPUParticles2D.new()
	p.one_shot = true
	p.emitting = true
	p.amount = 40
	p.lifetime = 1.2
	p.explosiveness = 1.0
	p.direction = Vector2(0, -1)
	p.spread = 70.0
	p.initial_velocity_min = 180.0
	p.initial_velocity_max = 340.0
	p.gravity = Vector2(0, 500)
	p.scale_amount_min = 2.0
	p.scale_amount_max = 4.5
	var grad := Gradient.new()
	grad.set_color(0, Color("ff6b6b"))
	grad.add_point(0.33, Color("ffd166"))
	grad.add_point(0.66, Color("06d6a0"))
	grad.set_color(1, Color("6b7fd7"))
	p.color_ramp = grad
	p.position = pos
	add_child(p)
	get_tree().create_timer(2.0).timeout.connect(p.queue_free)


# ----------------------------------------------------------------
#  Idle hint: ghost cursor glides over and mimes CLICK-CLICK
# ----------------------------------------------------------------
func _build_ghost_cursor() -> void:
	_ghost = Node2D.new()
	var arrow := Polygon2D.new()
	arrow.polygon = PackedVector2Array([
		Vector2(0, 0), Vector2(0, 26), Vector2(7, 20),
		Vector2(12, 30), Vector2(16, 28), Vector2(11, 18), Vector2(19, 17)
	])
	arrow.color = Color(0.4, 0.4, 0.9, 0.5)
	_ghost.add_child(arrow)
	_ghost.visible = false
	_ghost.z_index = 100
	add_child(_ghost)


func _on_idle_hint() -> void:
	if _finished or _object == null or _object_open:
		return
	_say(VOICE_INTRO, _current_instruction)
	_ghost.visible = true
	_ghost.position = get_viewport().get_mouse_position()
	var t := create_tween()
	t.tween_property(_ghost, "position", _object.position, 1.2)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	# Mime a fast click-click.
	t.tween_property(_ghost, "scale", Vector2.ONE * 0.75, 0.08)
	t.tween_property(_ghost, "scale", Vector2.ONE, 0.08)
	t.tween_property(_ghost, "scale", Vector2.ONE * 0.75, 0.08)
	t.tween_property(_ghost, "scale", Vector2.ONE, 0.08)
	t.tween_interval(0.3)
	t.tween_callback(_hide_ghost)
	_idle_timer.start()


func _hide_ghost() -> void:
	if _ghost:
		_ghost.visible = false
		_ghost.scale = Vector2.ONE


# ----------------------------------------------------------------
#  UI: one short text line + speaker button
# ----------------------------------------------------------------
func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	_instruction_label = RichTextLabel.new()
	_instruction_label.bbcode_enabled = true
	_instruction_label.fit_content = true
	_instruction_label.scroll_active = false
	_instruction_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_instruction_label.add_theme_font_override("normal_font", UI_FONT)
	_instruction_label.add_theme_font_size_override("normal_font_size", 34)
	_instruction_label.add_theme_color_override("font_outline_color", Color("5a4a6b"))
	_instruction_label.add_theme_constant_override("outline_size", 10)
	_instruction_label.add_theme_constant_override("line_separation", 28)
	# Just below the star badge row, with breathing room.
	_instruction_label.anchor_left = 0.05
	_instruction_label.anchor_right = 0.95
	_instruction_label.anchor_top = 0.1
	_instruction_label.anchor_bottom = 0.2
	layer.add_child(_instruction_label)

	_speaker_btn = Button.new()
	_speaker_btn.text = "🔊"
	_speaker_btn.add_theme_font_size_override("font_size", 30)
	_speaker_btn.anchor_left = 0.0
	_speaker_btn.anchor_top = 1.0
	_speaker_btn.offset_left = 16
	_speaker_btn.offset_top = -76
	_speaker_btn.offset_right = 76
	_speaker_btn.offset_bottom = -16
	_speaker_btn.pressed.connect(func () -> void: _say(VOICE_INTRO, _current_instruction))
	layer.add_child(_speaker_btn)


# ----------------------------------------------------------------
#  Narration: recorded voice clips (audio-first), text line synced
# ----------------------------------------------------------------
func _say(clip: AudioStream, text: String) -> void:
	_instruction_label.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ text
		+ "[/rainbow][/center]"
	)
	_voice.stop()               # never overlap two voice lines
	_voice.stream = clip
	_voice.play()


# ----------------------------------------------------------------
#  Sounds (generated, zero assets)
# ----------------------------------------------------------------
func _play_tone(freq_start: float, freq_end: float, dur: float, vol: float) -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _tone_wave(freq_start, freq_end, dur, vol)
	player.finished.connect(player.queue_free)
	player.play()


# Builds the tone as a real WAV buffer up front instead of feeding an
# AudioStreamGenerator live from the main thread — the live-push API
# contends with the audio mixer thread, and several tones/voice lines
# starting at once (e.g. right after finishing a level) was able to
# hang the whole process.
func _tone_wave(freq_start: float, freq_end: float, dur: float, vol: float) -> AudioStreamWAV:
	var mix_rate := 22050
	var frames := int(mix_rate * dur)
	var data := PackedByteArray()
	data.resize(frames * 2)   # 16-bit mono
	var byte_idx := 0
	for i in frames:
		var tt := float(i) / mix_rate
		var k := tt / dur
		var freq := lerpf(freq_start, freq_end, k)
		var env := 1.0 - k
		var v := sin(TAU * freq * tt) * vol * env
		data.encode_s16(byte_idx, int(clampf(v, -1.0, 1.0) * 32767.0))
		byte_idx += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = data
	return wav


func _play_tone_delayed(freq_start: float, freq_end: float, dur: float, vol: float, delay: float) -> void:
	get_tree().create_timer(delay).timeout.connect(
		func () -> void: _play_tone(freq_start, freq_end, dur, vol)
	)
	
	
