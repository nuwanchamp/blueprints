# =============================================================
#  Mouse Skills Adventure with Pip
#  LEVEL 4 — Corner Homes  (animated-house edition)
#
#  All four houses are instances of your animated house scene:
#      res://Scenes/animated-house.tscn
#  Reaching the glowing house plays the "house-open" animation,
#  then the house resets to "default" for the next round.
#
#  Star awarding is handled by the GLOBAL StarChart autoload
#  (star_chart.gd registered as "StarChart" in Project Settings
#  > Globals). This level plays no local star animation.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 4

const BUNNY_HOUSE_SCENE := preload("res://Scenes/unit1-level-4/animated-bunny-house.tscn")
const PUPPY_HOUSE_SCENE := preload("res://Scenes/unit1-level-4/animated-puppy-house.tscn")
const KITTY_HOUSE_SCENE := preload("res://Scenes/unit1-level-4/animated-kitty-house.tscn")
const CHICK_HOUSE_SCENE := preload("res://Scenes/unit1-level-4/animated-chick-house.tscn")

# Order must match ANIMAL_NAMES: bunny, kitty, puppy, chick.
const HOUSE_SCENES: Array[PackedScene] = [
	BUNNY_HOUSE_SCENE, KITTY_HOUSE_SCENE, PUPPY_HOUSE_SCENE, CHICK_HOUSE_SCENE,
]
const ANIM_IDLE := "default"
const ANIM_OPEN := "house-open"

# House size per round, as a fraction of the SHORTER screen side.
# Hidden precision training: 30% -> 20% -> 12%.
const ROUND_SIZES := [0.480, 0.36, 0.28]
const CORNERS_PER_ROUND := 4
const IDLE_HINT_SECONDS := 8.0

const COL_BG       := Color("fdf6ec")
const COL_PATHTEXT := Color("6b5b95")
const ANIMAL_NAMES := ["bunny", "kitty", "puppy", "chick"]

# --- Recorded voice clips (adjust the folder path if needed) ---
const VOICE_INTRO: AudioStream   = preload("res://Assets/bunny-house/pip-waiting.mp3")
const VOICE_INTRO_2: AudioStream = preload("res://Assets/bunny-house/pip-waiting-2.mp3")
const VOICE_SMALLER: AudioStream = preload("res://Assets/bunny-house/smaller-houes.mp3")
const VOICE_VISITED: AudioStream = preload("res://Assets/bunny-house/visited-all.mp3")
# Order must match ANIMAL_NAMES: bunny, kitty, puppy, chick.
const VOICE_FOUND: Array[AudioStream] = [
	preload("res://Assets/bunny-house/bunny-founded.mp3"),
	preload("res://Assets/bunny-house/kitty-found.mp3"),
	preload("res://Assets/bunny-house/puppy-found.mp3"),
	preload("res://Assets/bunny-house/chick-founded.mp3"),
]

# --- Custom display font (adjust path via right-click > Copy Path) ---
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")

# --- Custom cursor, same on every screen ---
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

var _round := 0                 # 0..2
var _corners_done := 0          # corners completed in current round
var _order: Array = []          # shuffled corner indices for the round
var _target_idx := -1           # which corner is currently lit (-1 = none)
var _houses: Array = []         # 4 dicts: {root, sprite, frame_size}
var _accepting_input := false

var _idle_timer: Timer
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _ghost: Node2D              # ghost cursor for the idle hint
var _instruction_label: RichTextLabel   # rainbow BBCode text
var _speaker_btn: Button
var _confetti: CPUParticles2D
var _current_instruction := ""
var _bounce_tween: Tween


# ----------------------------------------------------------------
#  Setup
# ----------------------------------------------------------------
func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_POINTING_HAND)

	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	_build_houses()
	_layout_houses()   # position + scale right away, so there's no
					   # flash of giant unplaced houses during the intro
	_build_ui()
	_build_ghost_cursor()
	_build_confetti()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_INTRO, "Take the hand to the glowing house!")
	await get_tree().create_timer(2.0).timeout
	_start_round(0)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_POINTING_HAND)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


func _house_size_px() -> float:
	var s := _screen_size()
	return min(s.x, s.y) * ROUND_SIZES[_round]


func _corner_positions() -> Array:
	# Center points of the four corner houses, inset from edges.
	var s := _screen_size()
	var half := _house_size_px() * 0.5
	var m := half + 20.0
	return [
		Vector2(m, m),                 # 0 top-left
		Vector2(s.x - m, m),           # 1 top-right
		Vector2(m, s.y - m),           # 2 bottom-left
		Vector2(s.x - m, s.y - m),     # 3 bottom-right
	]


# ----------------------------------------------------------------
#  Houses (instances of the animated-house scene)
# ----------------------------------------------------------------
func _build_houses() -> void:
	for i in 4:
		_houses.append(_build_house(i))


func _build_house(i: int) -> Dictionary:
	var root := HOUSE_SCENES[i].instantiate() as Node2D
	add_child(root)

	var sprite := _find_animated_sprite(root)
	assert(sprite != null, "animated-house.tscn needs an AnimatedSprite2D")

	# Make sure the sprite is centred so the whole house scales and
	# bounces around its middle, and hit-testing stays symmetrical.
	sprite.centered = true

	# Measure one frame so we can scale the house to the exact size
	# each round asks for, whatever the source art resolution is.
	var frame_size := Vector2(100, 100)
	var tex := sprite.sprite_frames.get_frame_texture(ANIM_IDLE, 0)
	if tex:
		frame_size = tex.get_size()

	sprite.play(ANIM_IDLE)
	sprite.stop()
	sprite.frame = 0

	return {"root": root, "sprite": sprite, "frame_size": frame_size}


func _find_animated_sprite(node: Node) -> AnimatedSprite2D:
	if node is AnimatedSprite2D:
		return node as AnimatedSprite2D
	for child in node.get_children():
		var found := _find_animated_sprite(child)
		if found:
			return found
	return null


func _house_scale(i: int) -> float:
	var fs: Vector2 = _houses[i]["frame_size"]
	return _house_size_px() / maxf(fs.x, fs.y)


func _layout_houses() -> void:
	var positions := _corner_positions()
	for i in 4:
		var root: Node2D = _houses[i]["root"]
		root.position = positions[i]
		root.scale = Vector2.ONE * _house_scale(i)
		root.modulate = Color.WHITE
		var sprite: AnimatedSprite2D = _houses[i]["sprite"]
		sprite.play(ANIM_IDLE)
		sprite.stop()
		sprite.frame = 0


# ----------------------------------------------------------------
#  Round / target flow
# ----------------------------------------------------------------
func _start_round(r: int) -> void:
	_round = r
	_corners_done = 0
	_order = [0, 1, 2, 3]
	_order.shuffle()
	_layout_houses()
	_next_target()


func _next_target() -> void:
	if _corners_done >= CORNERS_PER_ROUND:
		_on_round_finished()
		return
	_target_idx = _order[_corners_done]
	_accepting_input = true
	_start_glow(_target_idx)
	_idle_timer.start()


func _start_glow(i: int) -> void:
	var root: Node2D = _houses[i]["root"]
	if _bounce_tween:
		_bounce_tween.kill()
	_bounce_tween = create_tween().set_loops()
	var base: Vector2 = root.scale
	_bounce_tween.tween_property(root, "scale", base * 1.12, 0.35)\
		.set_trans(Tween.TRANS_SINE)
	_bounce_tween.parallel().tween_property(root, "modulate", Color(1.25, 1.25, 0.9), 0.35)
	_bounce_tween.tween_property(root, "scale", base, 0.35).set_trans(Tween.TRANS_SINE)
	_bounce_tween.parallel().tween_property(root, "modulate", Color.WHITE, 0.35)


func _stop_glow(i: int) -> void:
	if _bounce_tween:
		_bounce_tween.kill()
	var root: Node2D = _houses[i]["root"]
	root.modulate = Color.WHITE
	root.scale = Vector2.ONE * _house_scale(i)


func _process(_delta: float) -> void:
	if not _accepting_input or _target_idx < 0:
		return
	var mouse := get_viewport().get_mouse_position()
	var center: Vector2 = _houses[_target_idx]["root"].position
	var half := _house_size_px() * 0.5
	var rect := Rect2(center - Vector2(half, half), Vector2(half, half) * 2.0)
	if rect.has_point(mouse):
		_on_target_reached()


func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		if _accepting_input:
			_idle_timer.start()   # any movement resets the idle hint
		_hide_ghost()


func _on_target_reached() -> void:
	_accepting_input = false
	_idle_timer.stop()
	_hide_ghost()
	_stop_glow(_target_idx)

	var h: Dictionary = _houses[_target_idx]
	var sprite: AnimatedSprite2D = h["sprite"]
	var root: Node2D = h["root"]
	var animal_name: String = ANIMAL_NAMES[_target_idx]

	# Play the house-open animation, with confetti + cheer.
	_burst_confetti(root.position)
	_play_cheer()
	_say(VOICE_FOUND[_target_idx], "Yay! You found the %s!" % animal_name)

	sprite.play(ANIM_OPEN)
	await get_tree().create_timer(_anim_duration(sprite, ANIM_OPEN) + 0.4).timeout

	# Close the house again for the next visit.
	sprite.play(ANIM_IDLE)
	sprite.stop()
	sprite.frame = 0

	_corners_done += 1
	_next_target()


func _anim_duration(sprite: AnimatedSprite2D, anim: String) -> float:
	# frames / fps, so it works whether or not the animation loops.
	var frames := sprite.sprite_frames.get_frame_count(anim)
	var fps := sprite.sprite_frames.get_animation_speed(anim)
	if fps <= 0.0:
		fps = 5.0
	return float(frames) / fps


func _on_round_finished() -> void:
	_target_idx = -1
	if _round < ROUND_SIZES.size() - 1:
		_say(VOICE_SMALLER, "The houses got smaller! Can you still find them?")
		await get_tree().create_timer(1.6).timeout
		_start_round(_round + 1)
	else:
		_award_star()


# ----------------------------------------------------------------
#  Star + level end (handled by the global StarChart autoload)
# ----------------------------------------------------------------
func _award_star() -> void:
	_say(VOICE_VISITED, "You visited every house! You earned a star!")
	StarChart.show_chart(StarChart.UNIT_1_LEVELS)
	await StarChart.add_star(LEVEL_NUMBER)
	level_completed.emit(LEVEL_NUMBER)
	get_tree().change_scene_to_file("res://Scenes/unit1-level5.tscn")


# ----------------------------------------------------------------
#  Idle hint (ghost cursor)
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
	if _target_idx < 0:
		return
	_say(VOICE_INTRO_2, _current_instruction)
	_ghost.visible = true
	_ghost.position = get_viewport().get_mouse_position()
	var t := create_tween()
	t.tween_property(_ghost, "position", _houses[_target_idx]["root"].position, 1.4)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	t.tween_interval(0.4)
	t.tween_callback(_hide_ghost)
	_idle_timer.start()   # hint repeats if the child stays idle


func _hide_ghost() -> void:
	if _ghost:
		_ghost.visible = false


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
	# Soft dark outline keeps rainbow text readable on pastel backgrounds.
	_instruction_label.add_theme_color_override("font_outline_color", Color("5a4a6b"))
	_instruction_label.add_theme_constant_override("outline_size", 10)
	_instruction_label.add_theme_constant_override("line_separation", 28)
	_instruction_label.anchor_left = 0.05
	_instruction_label.anchor_right = 0.95
	_instruction_label.anchor_top = 0.5
	_instruction_label.anchor_bottom = 0.5
	_instruction_label.grow_vertical = Control.GROW_DIRECTION_BOTH
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
	_speaker_btn.pressed.connect(func (): _say(VOICE_INTRO, _current_instruction))
	layer.add_child(_speaker_btn)


# ----------------------------------------------------------------
#  Narration: recorded voice clips (audio-first), text line synced
# ----------------------------------------------------------------
func _say(clip: AudioStream, text: String) -> void:
	if text == "Pip's friends are waiting! Take the sparkle to the glowing house!":
		_current_instruction = text
	_instruction_label.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ text
		+ "[/rainbow][/center]"
	)
	_voice.stop()               # never overlap two voice lines
	_voice.stream = clip
	_voice.play()


# ----------------------------------------------------------------
#  Feedback: confetti + cheer sound
# ----------------------------------------------------------------
func _build_confetti() -> void:
	_confetti = CPUParticles2D.new()
	_confetti.emitting = false
	_confetti.one_shot = true
	_confetti.amount = 40
	_confetti.lifetime = 1.2
	_confetti.explosiveness = 1.0
	_confetti.direction = Vector2(0, -1)
	_confetti.spread = 70.0
	_confetti.initial_velocity_min = 180.0
	_confetti.initial_velocity_max = 340.0
	_confetti.gravity = Vector2(0, 500)
	_confetti.scale_amount_min = 2.0
	_confetti.scale_amount_max = 4.5
	var grad := Gradient.new()
	grad.set_color(0, Color("ff6b6b"))
	grad.add_point(0.33, Color("ffd166"))
	grad.add_point(0.66, Color("06d6a0"))
	grad.set_color(1, Color("6b7fd7"))
	_confetti.color_ramp = grad
	add_child(_confetti)


func _burst_confetti(pos: Vector2) -> void:
	_confetti.position = pos
	_confetti.restart()
	_confetti.emitting = true


func _play_cheer() -> void:
	# Simple generated "ding" so the level is playable with zero assets.
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _cheer_wave()
	player.finished.connect(player.queue_free)
	player.play()


# Builds the "ding" as a real WAV buffer up front instead of feeding an
# AudioStreamGenerator live from the main thread — the live-push API
# contends with the audio mixer thread, and several sounds/voice lines
# starting at once was able to hang the whole process.
func _cheer_wave() -> AudioStreamWAV:
	var mix_rate := 22050
	var dur := 0.35
	var frames := int(mix_rate * dur)
	var data := PackedByteArray()
	data.resize(frames * 2)   # 16-bit mono
	var byte_idx := 0
	for i in frames:
		var tt := float(i) / mix_rate
		var freq := 880.0 + 440.0 * tt          # rising happy chirp
		var env := (1.0 - tt / dur)
		var v := sin(TAU * freq * tt) * 0.25 * env
		data.encode_s16(byte_idx, int(clampf(v, -1.0, 1.0) * 32767.0))
		byte_idx += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = data
	return wav
