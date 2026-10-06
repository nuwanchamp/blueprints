extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 2

@export_file("*.tscn") var next_scene: String = "res://Scenes/unit1-level4.tscn"
@onready var cheer = get_node("AudioStreamPlayer2D3")

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	StarChart.hide_chart()
	var balloons := get_tree().get_nodes_in_group("balloons")

	for balloon in balloons:
		balloon.tree_exited.connect(_on_balloon_gone)

func _on_balloon_gone() -> void:
	call_deferred("_check_remaining")

func _check_remaining() -> void:
	if get_tree() == null:
		return
	var left := get_tree().get_nodes_in_group("balloons").size()
	if left == 0:
		Confetti.rain()
		cheer.play()
		_award_star()
		get_tree().create_timer(2.5).timeout.connect(_on_celebration_finished)


func _award_star() -> void:
	StarChart.show_chart(StarChart.UNIT_1_LEVELS)
	await StarChart.add_star(LEVEL_NUMBER)
	level_completed.emit(LEVEL_NUMBER)


func _on_celebration_finished() -> void:
	var err := get_tree().change_scene_to_file(next_scene)
